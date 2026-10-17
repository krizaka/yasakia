import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import { z } from "zod";

/**
 * Media in a conversation: photos, short videos and voice messages. What is sent is **what is stored**: nothing is edited, trimmed,
 * filtered or recompressed — the file is only made clean (every metadata block removed, GPS included, by copying the streams into a
 * fresh container), measured (its length) and prepared for the safety check (frames of a video, the waveform of a voice message).
 * The limits are rows of the MEDIA rule set (`MediaLimits`), never constants.
 */

export const MESSAGE_MEDIA_KINDS = ["PHOTO", "VIDEO", "AUDIO"] as const;
export type MessageMediaKind = (typeof MESSAGE_MEDIA_KINDS)[number];

/** The bounds of the MEDIA rule set (the values are the rule set's: photo ≤ 10 MB, video ≤ 60 s / 50 MB, audio ≤ 2 min / 10 MB at version 1). */
export const MediaLimits = z
  .object({
    photoMaxBytes: z.number().int().min(100_000).max(25_000_000),
    videoMaxSeconds: z.number().int().min(5).max(180),
    videoMaxBytes: z.number().int().min(1_000_000).max(200_000_000),
    audioMaxSeconds: z.number().int().min(5).max(600),
    audioMaxBytes: z.number().int().min(100_000).max(50_000_000),
  })
  .strict();
export type MediaLimits = z.infer<typeof MediaLimits>;

export class MediaRefusal extends Error {
  constructor(
    readonly code: "MEDIA_UNREADABLE" | "MEDIA_WRONG_KIND" | "MEDIA_UNAVAILABLE" | "MEDIA_TOO_LARGE" | "MEDIA_TOO_LONG",
    message: string,
  ) {
    super(message);
    this.name = "MediaRefusal";
  }
}

/** Why the limits refuse this media, or null. `durationMs` is absent for a photo (and before the file has been measured). */
export function limitRefusal(kind: MessageMediaKind, media: { bytes: number; durationMs?: number }, limits: MediaLimits): { code: "MEDIA_TOO_LARGE" | "MEDIA_TOO_LONG"; max: number } | null {
  const maxBytes = kind === "PHOTO" ? limits.photoMaxBytes : kind === "VIDEO" ? limits.videoMaxBytes : limits.audioMaxBytes;
  if (media.bytes > maxBytes) return { code: "MEDIA_TOO_LARGE", max: maxBytes };
  const maxSeconds = kind === "VIDEO" ? limits.videoMaxSeconds : kind === "AUDIO" ? limits.audioMaxSeconds : undefined;
  if (maxSeconds !== undefined && media.durationMs !== undefined && media.durationMs > maxSeconds * 1000) return { code: "MEDIA_TOO_LONG", max: maxSeconds };
  return null;
}

export type Container = "mp4" | "webm" | "ogg" | "mp3" | "wav";

/** The container the bytes really are (magic numbers), whatever was declared; null for anything else. */
export function sniffMedia(bytes: Buffer): { container: Container } | null {
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") return { container: "mp4" }; // mp4, m4a, mov
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { container: "webm" };
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "OggS") return { container: "ogg" };
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") return { container: "mp3" };
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return { container: "mp3" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") return { container: "wav" };
  return null;
}

const MIME: Record<MessageMediaKind, Partial<Record<Container, string>>> = {
  PHOTO: {},
  VIDEO: { mp4: "video/mp4", webm: "video/webm" },
  AUDIO: { mp4: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav" },
};
const EXT: Record<Container, string> = { mp4: "mp4", webm: "webm", ogg: "ogg", mp3: "mp3", wav: "wav" };

export interface ProcessedMedia {
  /** The clean file (metadata removed, streams copied untouched). */
  body: Buffer;
  mime: string;
  /** The extension the stored file wears. */
  ext: string;
  durationMs: number;
  /** JPEG frames of a video for the safety check (empty for sound). */
  frames: Buffer[];
  /** The first frame of a video, as the picture shown before it plays. */
  poster: Buffer | null;
  /** 64 peaks between 0 and 100 for a voice message; null for a video. */
  peaks: number[] | null;
}

const TIMEOUT_MS = 40_000; // @fixed: a 60-second clip is remuxed in a fraction of this; a hung process is not waited for
const MAX_STDERR = 200_000; // @fixed: ffmpeg's banner and stream list are a few kilobytes

let binary: string | null = ffmpegPath ?? null;

/** Uses this ffmpeg instead of the one `ffmpeg-static` found (a container image copies it to a fixed path). */
export function setFfmpegBinary(path: string | undefined): void {
  if (path) binary = path;
}

function run(args: string[], options: { collectStdout?: boolean } = {}): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  if (!binary) return Promise.reject(new MediaRefusal("MEDIA_UNAVAILABLE", "ffmpeg is not available"));
  return new Promise((resolve, reject) => {
    const child = spawn(binary as string, ["-hide_banner", "-nostdin", ...args], { stdio: ["ignore", options.collectStdout ? "pipe" : "ignore", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => {
      if (err.length < MAX_STDERR) err += c.toString("utf8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new MediaRefusal("MEDIA_UNAVAILABLE", `ffmpeg could not start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: err });
    });
  });
}

/** Duration and streams, from what ffmpeg says of the file (its exit code is 1 for « no output file »: only the text matters). */
function describe(stderr: string): { durationMs: number; hasVideo: boolean; hasAudio: boolean } | null {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!d) return null;
  return { durationMs: Math.round((Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])) * 1000), hasVideo: /Stream #\d+:\d+[^\n]*: Video:/.test(stderr), hasAudio: /Stream #\d+:\d+[^\n]*: Audio:/.test(stderr) };
}

const FRAMES = 3; // @fixed: a start, a middle and an end are what a short clip is judged on
const PEAKS = 64; // @fixed: the bars of a voice message's waveform

/**
 * Cleans, measures and prepares a video or a voice message. Throws {@link MediaRefusal}: `MEDIA_UNREADABLE` (not media, truncated),
 * `MEDIA_WRONG_KIND` (a video where a voice message was declared, or the reverse), `MEDIA_UNAVAILABLE` (no ffmpeg — the caller answers 503).
 */
export async function processMedia(input: Buffer, kind: Exclude<MessageMediaKind, "PHOTO">): Promise<ProcessedMedia> {
  const sniffed = sniffMedia(input);
  if (!sniffed || (kind === "VIDEO" && !MIME.VIDEO[sniffed.container])) throw new MediaRefusal("MEDIA_UNREADABLE", "not a video or sound file we accept");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yasakia-media-"));
  try {
    const source = path.join(dir, `in.${EXT[sniffed.container]}`);
    await fs.writeFile(source, input);
    const probe = describe((await run(["-i", source])).stderr);
    if (!probe || probe.durationMs <= 0) throw new MediaRefusal("MEDIA_UNREADABLE", "the file cannot be read as media");
    if (kind === "VIDEO" && !probe.hasVideo) throw new MediaRefusal("MEDIA_WRONG_KIND", "no picture in a file declared as a video");
    if (kind === "AUDIO" && probe.hasVideo) throw new MediaRefusal("MEDIA_WRONG_KIND", "a video in a file declared as a voice message");
    if (kind === "AUDIO" && !probe.hasAudio) throw new MediaRefusal("MEDIA_UNREADABLE", "no sound in a file declared as a voice message");

    // Clean: copy the streams into a fresh container, with no metadata at all.
    const clean = path.join(dir, `out.${EXT[sniffed.container]}`);
    const copyArgs = ["-v", "error", "-i", source, "-map", "0:v?", "-map", "0:a?", "-map_metadata", "-1", "-map_chapters", "-1", "-c", "copy", ...(sniffed.container === "mp4" ? ["-movflags", "+faststart"] : []), "-y", clean];
    const copied = await run(copyArgs);
    if (copied.code !== 0) throw new MediaRefusal("MEDIA_UNREADABLE", "the file cannot be copied clean");
    const body = await fs.readFile(clean);

    const frames: Buffer[] = [];
    let peaks: number[] | null = null;
    if (kind === "VIDEO") {
      for (let i = 0; i < FRAMES; i++) {
        const at = (probe.durationMs / 1000) * (0.1 + (0.8 * i) / (FRAMES - 1));
        const jpg = path.join(dir, `f${i}.jpg`);
        const got = await run(["-v", "error", "-ss", at.toFixed(2), "-i", clean, "-frames:v", "1", "-vf", "scale='min(512,iw)':-2", "-q:v", "4", "-y", jpg]);
        if (got.code !== 0) throw new MediaRefusal("MEDIA_UNREADABLE", "a frame cannot be read");
        frames.push(await fs.readFile(jpg));
      }
    } else {
      const pcm = await run(["-v", "error", "-i", clean, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { collectStdout: true });
      if (pcm.code !== 0) throw new MediaRefusal("MEDIA_UNREADABLE", "the sound cannot be decoded");
      peaks = peaksOf(pcm.stdout);
    }
    return { body, mime: MIME[kind][sniffed.container] as string, ext: EXT[sniffed.container], durationMs: probe.durationMs, frames, poster: frames[0] ?? null, peaks };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** The loudest sample of each of 64 slices of 16-bit mono PCM, as 0..100 relative to the loudest of all (quiet stays quiet, never stretched to full). */
export function peaksOf(pcm: Buffer): number[] {
  const samples = Math.floor(pcm.length / 2);
  const out = new Array<number>(PEAKS).fill(0);
  if (samples === 0) return out;
  for (let i = 0; i < PEAKS; i++) {
    const from = Math.floor((i * samples) / PEAKS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples) / PEAKS));
    let max = 0;
    for (let s = from; s < to && s < samples; s++) max = Math.max(max, Math.abs(pcm.readInt16LE(s * 2)));
    out[i] = Math.min(100, Math.round((max / 32768) * 100));
  }
  return out;
}
