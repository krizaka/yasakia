#!/usr/bin/env node
/**
 * `node scripts/journey-clips.mjs <dir>` — cuts the recording of `npm run dev:journey` (`<dir>/journey.webm` and
 * `<dir>/evidence.json`) into the two clips the demo shows: `talk` (the conversation up to the portrait) and `batch` (the
 * first batch). Each is 20–60 s: the real run, cut at the steps the script wrote down, the waiting sped up uniformly (never
 * edited otherwise), encoded as .webm and .mp4 with a poster .jpg, and described in `<dir>/clips.json` (the cue times of the
 * captions, in the clip's own seconds). Needs ffmpeg. Nothing here is in the repository's media: the files go to Bunny.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".");
const evidence = JSON.parse(fs.readFileSync(path.join(dir, "evidence.json"), "utf8"));
const source = path.join(dir, "journey.webm");
const t0 = Date.parse(evidence.videoStartedAt);
const at = (name, from = 0) => {
  const step = evidence.steps.slice(from).find((s) => s.name === name || s.name.startsWith(name));
  if (!step) throw new Error(`no step "${name}" in evidence.json`);
  return (Date.parse(step.at) - t0) / 1000;
};
const run = (...args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });

/** [name, start, end, [step names whose time becomes a caption cue]] — in the source's seconds. */
const looped = evidence.steps.some((s) => s.name === "answer the batch");
const end = (Date.parse(evidence.finishedAt) - t0) / 1000;
const MAX = looped ? 60 : 55; // seconds: the rule says 20 to 60
// The whole loop (`--through loop`) is one clip: talk → portrait → batch → answers → debrief → introduction.
const clips = looped
  ? [["loop", at("open the conversation") - 0.5, end, ["open the conversation", "message 1 sent", "message 3 sent", "portrait written", "open the first batch", "batch shown", "answer the batch", "said yes", "everyone answered", "debrief sent", "open the introduction", "first line sent"]]]
  : [
  ["talk", at("open the conversation") - 0.5, at("portrait written") + 3.5, ["open the conversation", "message 1 sent", "message 2 sent", "message 3 sent", "message 5 sent", "portrait written"]],
  ["batch", at("open the first batch") - 0.5, end, ["open the first batch", "batch: HTTP", "batch shown"]],
];
const out = [];
for (const [name, start, end, cueSteps] of clips) {
  const real = end - start;
  const speed = Math.max(1, real / MAX);
  const length = real / speed;
  const filters = `setpts=PTS/${speed.toFixed(4)},scale=1920:1080:flags=lanczos,fps=30`;
  const base = ["-ss", start.toFixed(2), "-t", real.toFixed(2), "-i", source, "-an", "-vf", filters];
  run(...base, "-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", "-row-mt", "1", path.join(dir, `${name}.webm`));
  run(...base, "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(dir, `${name}.mp4`));
  run("-ss", (start + real * 0.92).toFixed(2), "-i", source, "-frames:v", "1", "-vf", "scale=1920:1080:flags=lanczos", "-q:v", "3", path.join(dir, `${name}.jpg`));
  const cues = cueSteps.map((s) => ({ step: s, at: Math.max(0, +(((at(s) - start) / speed).toFixed(1))) }));
  out.push({ name, seconds: +length.toFixed(1), speed: +speed.toFixed(2), cues });
  console.log(`✓ ${name}: ${length.toFixed(1)} s (x${speed.toFixed(2)})`);
}
fs.writeFileSync(path.join(dir, "clips.json"), `${JSON.stringify(out, null, 2)}\n`);
