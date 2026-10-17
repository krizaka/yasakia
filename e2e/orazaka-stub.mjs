#!/usr/bin/env node
/**
 * A stand-in for Orazaka's edge, for CI and the local scenarios ONLY: the same contract Yasakia's adapter speaks
 * (a bearer `oz_` key, `POST /api/v1/chat/stream/{id}` answered as server-sent events, `DELETE /api/v1/chat/sessions/{id}`,
 * `POST /api/v1/embeddings` in OpenAI's shape with a `runId`), with answers computed from the prompt — no model.
 * The real engine is proven by the live run on dev (scripts/dev-journey.mjs, request ids in the PR), not here.
 *
 *   node e2e/orazaka-stub.mjs [port]          # default 4599
 *   POST /__control/down | /__control/up      # the engine "goes down" (503) and comes back
 *   GET  /__control/runs                      # what it was asked: chats [{id, kind}], embeddings [runId], forgotten [id]
 */
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

const DIM = 1024;

/** A bag of the words of a text hashed into 1024 dimensions, unit length: texts that share words are close. */
export function vectorOf(text) {
  const v = new Array(DIM).fill(0);
  for (const raw of text.toLowerCase().match(/[a-zà-ÿ]{4,}/g) ?? []) v[createHash("sha256").update(raw).digest().readUInt16BE(0) % DIM] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

const personLines = (prompt) => [...prompt.matchAll(/^PERSON: (.+)$/gm)].map((m) => m[1]);

/** What the "model" extracts: the e2e messages state their facts with fixed phrases (see e2e/scenarios.mjs). */
function extraction(prompt) {
  const lines = personLines(prompt);
  const all = lines.join(" ");
  const basics = {};
  const name = /my name is (\p{L}+)/iu.exec(all)?.[1];
  if (name) basics.displayName = name;
  const gender = /I am an? (woman|man)/i.exec(all)?.[1];
  if (gender) basics.gender = gender.toLowerCase() === "woman" ? "WOMAN" : "MAN";
  const seeking = /looking for (women|men)/i.exec(all)?.[1];
  if (seeking) basics.seekingGenders = [seeking.toLowerCase() === "women" ? "WOMAN" : "MAN"];
  const ages = /between (\d+) and (\d+)/i.exec(all);
  if (ages) Object.assign(basics, { ageMin: Number(ages[1]), ageMax: Number(ages[2]) });
  if (/long-term relationship/i.test(all)) basics.intent = "LONG_TERM";
  const km = /within (\d+) km/i.exec(all)?.[1];
  if (km) basics.radiusKm = Number(km);
  if (/live in Montréal/i.test(all)) basics.place = { city: "Montréal", lat: 45.5017, lng: -73.5673 };
  const facets = [];
  const pick = (key, re, asList = false) => {
    const line = lines.find((l) => re.test(l));
    if (line) facets.push({ key, value: asList ? line.split(/[.,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4) : line });
  };
  if (lines.length) facets.push({ key: "story", value: lines[0] });
  pick("weekend", /weekends?/i);
  pick("values", /value/i, true);
  pick("humour", /laugh/i);
  pick("dealbreakers", /cannot stand/i, true);
  pick("seeking", /hope to meet/i);
  return { basics, facets };
}

function portrait(prompt) {
  const facets = JSON.parse(/What was understood \(JSON\): (.+)$/m.exec(prompt)?.[1] ?? "{}");
  const flat = (v) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));
  const self = [facets.story, facets.weekend, facets.values, facets.humour].filter(Boolean).map(flat).join(" ");
  const seeking = flat(facets.seeking) || "someone kind and curious";
  return { self, seeking, selfEn: self, seekingEn: seeking };
}

function reasons(prompt) {
  const you = /YOU are talking to (\S+?)[ .]/.exec(prompt)?.[1] ?? "you";
  const them = [...prompt.matchAll(/^(\d+)\. (\S+?) — /gm)];
  return { people: them.map((m) => ({ index: Number(m[1]), forYou: [`${m[2]} shares what you described: the same kind of weekends and the same curiosity.`], forThem: [`${you} looks for what ${m[2]} is: someone curious, with the same rhythm.`] })) };
}

function answerFor(prompt) {
  if (prompt.includes("You extract structured facts")) return { kind: "extract", text: `\`\`\`json\n${JSON.stringify(extraction(prompt))}\n\`\`\`` };
  if (prompt.includes("You write the portrait of a person")) return { kind: "portrait", text: JSON.stringify(portrait(prompt)) };
  if (prompt.includes("Write the closing message")) return { kind: "wrap", text: "I think I have a good picture of you. Tell me if I got something wrong; now I look for people who fit you, and for whom you fit too." };
  if (prompt.includes("Explain, in words only")) return { kind: "reasons", text: JSON.stringify(reasons(prompt)) };
  const turn = personLines(prompt).length;
  return { kind: "ask", text: turn ? `Thanks for telling me that (turn ${turn}). What else would you like me to know about you?` : "Hello, I am the Yasakia agent. We talk first, then I open a small batch of people who fit you both ways. What is your name?" };
}

export function startOrazakaStub(port = 4599) {
  let isDown = false;
  const runs = { chats: [], embeddings: [], forgotten: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const reply = (status, json) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      const path = (req.url ?? "").split("?")[0];
      if (path === "/__control/down") return (isDown = true), reply(200, { down: true });
      if (path === "/__control/up") return (isDown = false), reply(200, { down: false });
      if (path === "/__control/runs") return reply(200, runs);
      if (isDown) return reply(503, { error: "down" });
      if (!/^Bearer oz_/.test(req.headers.authorization ?? "")) return reply(401, {});
      const chat = /^\/edge\/api\/v1\/chat\/stream\/([^/]+)$/.exec(path);
      if (req.method === "POST" && chat) {
        const { text, kind } = answerFor(JSON.parse(body || "{}").prompt ?? "");
        runs.chats.push({ id: chat[1], kind });
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`id:${chat[1]}\nevent:pipeline-ack\ndata:{"pipelineId":"default"}\n\n`);
        for (const piece of text.match(/.{1,40}/gs) ?? []) res.write(`id:${chat[1]}\nevent:message\ndata:${JSON.stringify({ content: piece })}\n\n`);
        return res.end();
      }
      const forget = /^\/edge\/api\/v1\/chat\/sessions\/([^/]+)$/.exec(path);
      if (req.method === "DELETE" && forget) return runs.forgotten.push(forget[1]), res.writeHead(204).end();
      if (req.method === "POST" && path === "/edge/api/v1/embeddings") {
        const { input } = JSON.parse(body || "{}");
        const runId = randomUUID();
        runs.embeddings.push(runId);
        return reply(200, { runId, model: "gte-large-en-v1.5", dimensions: DIM, data: input.map((t, index) => ({ index, embedding: vectorOf(t) })), usage: { promptTokens: input.join(" ").length } });
      }
      return reply(404, {});
    });
  });
  server.listen(port, "127.0.0.1");
  return { server, port, stop: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = startOrazakaStub(Number(process.argv[2] ?? 4599));
  console.log(`Orazaka stub (CI and local scenarios only) on http://127.0.0.1:${port}/edge`);
}
