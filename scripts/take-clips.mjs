#!/usr/bin/env node
/**
 * `node scripts/take-clips.mjs <dir> [outDir]` — cuts the take of `scripts/record-take.mjs` (<dir>/take.mp4 and <dir>/evidence.json)
 * into the hero's loop and one clip per step of the landing's journey. A cut is a stretch of the real recording, played faster
 * where the run only waits (a photo being checked, the agent answering): one uniform speed per clip, nothing edited, nothing
 * added. Each clip is 30 fps, 390x844, as .mp4 and .webm plus a poster .jpg, named `take-<id>.<ext>` (the CDN upload adds the hash).
 * Needs ffmpeg. The files go to Bunny (scripts/cdn-assets.mjs of krizaka-com), never into this repository.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";

const dir = path.resolve(process.argv[2] ?? ".");
const outDir = path.resolve(process.argv[3] ?? path.join(dir, "clips"));
const evidence = JSON.parse(fs.readFileSync(path.join(dir, "evidence.json"), "utf8"));
const at = (name) => {
  const step = evidence.steps.find((s) => s.name === name || s.name.startsWith(name));
  if (!step) throw new Error(`no step "${name}" in evidence.json`);
  return step.at;
};

/** id → [from, to, speed, poster second (in the take)] */
const CLIPS = {
  hero: [at("add the photos"), at("photo check passed") + 3, 3.5, at("photo check passed") + 2.5],
  photos: [at("open the photos"), at("photo check passed") + 3, 2, at("photo check passed") + 2.5],
  talk: [at("open the conversation"), at("portrait written") + 2, 2.5, at("portrait written") + 1.5],
  batch: [at("open the first batch"), at("open the introduction") - 1, 1.6, at("batch shown") + 1],
  write: [at("open the introduction"), at("send a photo") - 0.5, 1, at("authenticity signal shown") + 1],
  media: [at("send a photo"), at("send a voice message") + 7, 1, at("photo approved") + 1],
};

fs.mkdirSync(outDir, { recursive: true });
const ff = (...a) => execFileSync(ffmpegPath, ["-y", "-v", "error", ...a], { stdio: "inherit" });
const source = path.join(dir, "take.mp4");
const manifest = {};
for (const [id, [from, to, speed, poster]] of Object.entries(CLIPS)) {
  const vf = `setpts=PTS/${speed},fps=30,scale=390:844:flags=lanczos`;
  const input = ["-ss", from.toFixed(2), "-to", to.toFixed(2), "-i", source];
  const base = path.join(outDir, `take-${id}`);
  ff(...input, "-vf", `${vf},format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-movflags", "+faststart", `${base}.mp4`);
  ff(...input, "-vf", vf, "-an", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", `${base}.webm`);
  ff("-ss", poster.toFixed(2), "-i", source, "-frames:v", "1", "-vf", "scale=390:844:flags=lanczos", "-q:v", "4", `${base}.jpg`);
  const seconds = (to - from) / speed;
  manifest[id] = { seconds: Number(seconds.toFixed(1)), speed, from: Number(from.toFixed(1)), to: Number(to.toFixed(1)) };
  console.log(`✓ take-${id}: ${seconds.toFixed(1)} s (x${speed})`);
}
fs.writeFileSync(path.join(outDir, "clips.json"), `${JSON.stringify(manifest, null, 2)}\n`);
