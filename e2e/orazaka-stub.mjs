#!/usr/bin/env node
/**
 * A stand-in for Orazaka's edge, for CI and the local scenarios ONLY: the same contract Yasakia's adapter speaks
 * (a bearer `oz_` key, `POST /api/v1/chat/stream/{id}` answered as server-sent events, `DELETE /api/v1/chat/sessions/{id}`,
 * `POST /api/v1/embeddings` in OpenAI's shape with a `runId`), with answers computed from the prompt — no model.
 * The real engine is proven by the live run on dev (scripts/dev-journey.mjs, request ids in the PR), not here.
 *
 *   node e2e/orazaka-stub.mjs [port]          # default 4599
 *   POST /__control/down | /__control/up      # the engine "goes down" (503) and comes back
 *   GET  /__control/runs                      # what it was asked: chats [{id, kind}], embeddings [runId], forgotten [id],
 *                                             #   photoChecks [{runId, photos, counts, compareFaces}], assets {uploaded, deleted}
 *
 * The photo check (Studio `profile-photo-check`): media upload, a run that is RUNNING once and then done, asset deletion. No
 * model and no face detection — the verdict is read from the *colour* of each thumbnail (see PHOTO_CLASSES), so a scenario
 * chooses what a photo "shows" by painting it.
 */
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

const DIM = 1024;

/** A bag of the words of a text hashed into 1024 dimensions, unit length: texts that share words are close. */
export function vectorOf(text) {
  const v = new Array(DIM).fill(0);
  for (const raw of text.toLowerCase().match(/[a-zà-ÿ]{4,}/g) ?? []) v[createHash("sha256").update(raw).digest().readUInt16BE(0) % DIM] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/**
 * What a flat-coloured thumbnail "shows", for the photo-check stand-in: [name, test on the mean r,g,b]. The scenarios paint
 * their pictures with these colours (e2e/scenarios.mjs PHOTO_COLORS).
 */
export const PHOTO_CLASSES = [
  ["FACE_A", (r, g, b) => r > 170 && g < 90 && b < 90],
  ["FACE_B", (r, g, b) => b > 170 && r < 90 && g < 90],
  ["GROUP", (r, g, b) => g > 170 && b > 170 && r < 90],
  ["TEXT", (r, g, b) => r > 215 && g > 215 && b > 215],
  ["SCREENSHOT", (r, g, b) => r > 170 && g > 170 && b < 90],
  ["MINOR", (r, g, b) => r > 170 && b > 170 && g < 90],
];

async function classOf(base64) {
  const { dominant } = await sharp(Buffer.from(base64, "base64")).stats();
  const [r, g, b] = [dominant.r, dominant.g, dominant.b];
  return PHOTO_CLASSES.find(([, test]) => test(r, g, b))?.[0] ?? "NONE";
}

/** The pack's verdict (profile-photo-check, worker/rules.py), computed from the classes: same shape, same codes. */
export function photoReport(classes, counts, compareFaces = true) {
  const photos = classes.map((c, index) => {
    const kind = c === "FACE_A" || c === "FACE_B" || c === "MINOR" ? "FACE" : c === "GROUP" ? "GROUP" : "NO_FACE";
    const findings = [];
    if (c === "TEXT") findings.push({ code: "TEXT_OR_CONTACT", severity: "BLOCK" });
    if (c === "SCREENSHOT") findings.push({ code: "SCREENSHOT", severity: "BLOCK" });
    if (c === "MINOR") findings.push({ code: "MINOR_LIKELY", severity: "BLOCK" });
    if (c === "GROUP") findings.push({ code: "GROUP_PHOTO", severity: "INFO" });
    return { index, kind, faceCount: kind === "FACE" ? 1 : kind === "GROUP" ? 3 : 0, findings };
  });
  const a = classes.filter((c) => c === "FACE_A").length;
  const b = classes.filter((c) => c === "FACE_B").length;
  const mismatch = compareFaces && a && b ? (a >= b ? "FACE_B" : "FACE_A") : null;
  classes.forEach((c, i) => c === mismatch && photos[i].findings.push({ code: "FACE_MISMATCH", severity: "BLOCK" }));
  const facePhotos = photos.filter((p) => p.kind === "FACE" && !p.findings.some((f) => f.code === "FACE_MISMATCH")).length;
  const blockers = [];
  if (photos.length < counts.minPhotos) blockers.push({ code: "TOO_FEW_PHOTOS", photos: [] });
  if (photos.length > counts.maxPhotos) blockers.push({ code: "TOO_MANY_PHOTOS", photos: [] });
  if (facePhotos < counts.minFacePhotos) blockers.push({ code: "TOO_FEW_FACE_PHOTOS", photos: [] });
  for (const code of ["FACE_MISMATCH", "MINOR_LIKELY", "SCREENSHOT", "TEXT_OR_CONTACT"]) {
    const at = photos.filter((p) => p.findings.some((f) => f.code === code)).map((p) => p.index);
    if (at.length) blockers.push({ code, photos: at });
  }
  return {
    rulesetId: "profile-photo",
    rulesetVersion: "2026-10-17",
    rulesetRevision: 1,
    photos,
    identity: compareFaces ? { status: mismatch ? "MISMATCH" : a + b > 1 ? "CONSISTENT" : "NOT_COMPARABLE", compared: a + b } : { status: "NOT_COMPARED", compared: 0 },
    counts: { photos: photos.length, facePhotos, required: counts },
    passes: blockers.length === 0,
    blockers,
    limits: ["FACE_IDENTITY_IS_A_MISMATCH_DETECTOR", "NO_CELEBRITY_RECOGNITION", "MODEL_ANSWERS_CAN_BE_WRONG"],
  };
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
  const runs = { chats: [], embeddings: [], forgotten: [], photoChecks: [], assets: { uploaded: [], deleted: [] } };
  const stored = new Map(); // asset id -> bytes
  const photoRuns = new Map(); // run id -> { polls, report }
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const raw = Buffer.concat(chunks);
      const body = raw.toString("utf8");
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
      if (req.method === "POST" && path === "/edge/api/v1/media/upload") {
        const form = await new Response(raw, { headers: { "content-type": req.headers["content-type"] ?? "" } }).formData().catch(() => null);
        const file = form?.get("file");
        if (!file || typeof file === "string" || file.size === 0) return reply(400, {});
        const assetId = randomUUID();
        stored.set(assetId, Buffer.from(await file.arrayBuffer()));
        runs.assets.uploaded.push(assetId);
        return reply(200, { assetId, filename: "photo.jpg", contentType: "image/jpeg", sizeBytes: file.size });
      }
      const asset = /^\/edge\/api\/v1\/media\/assets\/([^/]+)$/.exec(path);
      if (req.method === "DELETE" && asset) {
        if (!stored.delete(asset[1])) return reply(404, {});
        runs.assets.deleted.push(asset[1]);
        return res.writeHead(204).end();
      }
      if (req.method === "POST" && path === "/edge/api/v1/studios/profile-photo-check/runs") {
        const { inputs } = JSON.parse(body || "{}");
        const known = (inputs?.photos ?? []).every((id) => stored.has(id));
        if (!known || !Array.isArray(inputs?.photosBase64) || inputs.photosBase64.length !== inputs.photos.length) return reply(400, { error: "photos and photosBase64 must name the same photos" });
        const counts = { minPhotos: inputs.minPhotos ?? 4, maxPhotos: inputs.maxPhotos ?? 6, minFacePhotos: inputs.minFacePhotos ?? 2 };
        const compareFaces = inputs.compareFaces === true;
        const report = photoReport(await Promise.all(inputs.photosBase64.map(classOf)), counts, compareFaces);
        const id = randomUUID();
        photoRuns.set(id, { polls: 0, report });
        runs.photoChecks.push({ runId: id, photos: inputs.photos.length, counts, compareFaces });
        return reply(200, { id, studioKey: "profile-photo-check", status: "RUNNING", outputs: [], errorMessage: null, steps: [] });
      }
      const photoRun = /^\/edge\/api\/v1\/studios\/runs\/([^/]+)$/.exec(path);
      if (req.method === "GET" && photoRun && photoRuns.has(photoRun[1])) {
        const run = photoRuns.get(photoRun[1]);
        const done = ++run.polls > 1; // RUNNING once, so the client's polling is exercised
        return reply(200, { id: photoRun[1], studioKey: "profile-photo-check", status: done ? "SUCCEEDED" : "RUNNING", outputs: done ? [{ key: "report", label: "Verdict, en codes", type: "JSON", value: JSON.stringify(run.report) }] : [], errorMessage: null, steps: [] });
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
