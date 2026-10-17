import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import { beforeAll, describe, expect, it } from "vitest";

import { limitRefusal, MediaLimits, MediaRefusal, processMedia, sniffMedia } from "./message-media";

const ffmpeg = ffmpegPath as string;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yasakia-media-test-"));
const make = (name: string, args: string[]) => {
  const out = path.join(dir, name);
  execFileSync(ffmpeg, ["-v", "error", ...args, "-y", out]);
  return fs.readFileSync(out);
};
let mp4: Buffer;
let m4a: Buffer;
let ogg: Buffer;
let silentVideo: Buffer;

beforeAll(() => {
  // A short clip with a GPS-like tag and a title, as a phone would write them.
  mp4 = make("clip.mp4", ["-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-metadata", "title=SECRET-TITLE", "-metadata", "location=+45.5017-073.5673/"]);
  m4a = make("note.m4a", ["-f", "lavfi", "-i", "sine=frequency=330:duration=2", "-c:a", "aac", "-metadata", "artist=SECRET-ARTIST"]);
  ogg = make("note.ogg", ["-f", "lavfi", "-i", "sine=frequency=330:duration=2", "-c:a", "libvorbis"]);
  silentVideo = make("silent.mp4", ["-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=10", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
});

const limits = MediaLimits.parse({ photoMaxBytes: 10 * 1024 * 1024, videoMaxSeconds: 60, videoMaxBytes: 50 * 1024 * 1024, audioMaxSeconds: 120, audioMaxBytes: 10 * 1024 * 1024 });

describe("the limits are data, checked on the bytes and on the length", () => {
  it("holds the bounds the rule set may take", () => {
    expect(MediaLimits.safeParse({ ...limits, videoMaxSeconds: 2 }).success).toBe(false);
    expect(MediaLimits.safeParse({ ...limits, audioMaxBytes: 999_999_999 }).success).toBe(false);
    expect(MediaLimits.safeParse({ ...limits, extra: 1 }).success).toBe(false);
  });
  it("a photo ≤ 10 MB; a video ≤ 60 s and 50 MB; a voice message ≤ 2 min and 10 MB", () => {
    expect(limitRefusal("PHOTO", { bytes: 10 * 1024 * 1024 }, limits)).toBeNull();
    expect(limitRefusal("PHOTO", { bytes: 10 * 1024 * 1024 + 1 }, limits)).toEqual({ code: "MEDIA_TOO_LARGE", max: 10 * 1024 * 1024 });
    expect(limitRefusal("VIDEO", { bytes: 1000, durationMs: 60_000 }, limits)).toBeNull();
    expect(limitRefusal("VIDEO", { bytes: 1000, durationMs: 60_001 }, limits)).toEqual({ code: "MEDIA_TOO_LONG", max: 60 });
    expect(limitRefusal("VIDEO", { bytes: 50 * 1024 * 1024 + 1, durationMs: 1000 }, limits)?.code).toBe("MEDIA_TOO_LARGE");
    expect(limitRefusal("AUDIO", { bytes: 1000, durationMs: 120_000 }, limits)).toBeNull();
    expect(limitRefusal("AUDIO", { bytes: 1000, durationMs: 120_001 }, limits)?.code).toBe("MEDIA_TOO_LONG");
    expect(limitRefusal("AUDIO", { bytes: 10 * 1024 * 1024 + 1 }, limits)?.code).toBe("MEDIA_TOO_LARGE");
  });
  it("a changed rule set moves the limit — nothing is typed in the code", () => {
    expect(limitRefusal("VIDEO", { bytes: 1, durationMs: 45_000 }, { ...limits, videoMaxSeconds: 30 })?.code).toBe("MEDIA_TOO_LONG");
  });
});

describe("sniffMedia — the bytes decide, never the declaration", () => {
  it("knows the containers it accepts", () => {
    expect(sniffMedia(mp4)).toMatchObject({ container: "mp4" });
    expect(sniffMedia(ogg)).toMatchObject({ container: "ogg" });
    expect(sniffMedia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toMatchObject({ container: "webm" });
    expect(sniffMedia(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(20)]))).toMatchObject({ container: "mp3" });
    expect(sniffMedia(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]))).toMatchObject({ container: "wav" });
  });
  it("refuses what is none of them (a script, a PDF, an executable, text)", () => {
    for (const bytes of [Buffer.from("#!/bin/sh\necho hi"), Buffer.from("%PDF-1.7 ..."), Buffer.from([0x4d, 0x5a, 0x90, 0]), Buffer.from("hello"), Buffer.alloc(0)]) expect(sniffMedia(bytes)).toBeNull();
  });
});

describe("processMedia — the stored file is clean, measured and ready to judge", () => {
  it("a video: no metadata left (title, GPS), its length, three frames, a poster", async () => {
    expect(mp4.includes(Buffer.from("SECRET-TITLE"))).toBe(true);
    const out = await processMedia(mp4, "VIDEO");
    expect(out.mime).toBe("video/mp4");
    expect(out.body.includes(Buffer.from("SECRET-TITLE"))).toBe(false);
    expect(out.body.includes(Buffer.from("+45.5017"))).toBe(false);
    expect(out.durationMs).toBeGreaterThan(2500);
    expect(out.durationMs).toBeLessThan(3600);
    expect(out.frames).toHaveLength(3);
    expect(out.frames.every((f) => f.length > 500 && f[0] === 0xff && f[1] === 0xd8)).toBe(true); // JPEGs
    expect(out.poster).toBeInstanceOf(Buffer);
    expect(out.peaks).toBeNull();
  });
  it("a voice message: no metadata, its length, a waveform of 64 peaks between 0 and 100, no frames", async () => {
    const out = await processMedia(m4a, "AUDIO");
    expect(out.mime).toBe("audio/mp4");
    expect(out.body.includes(Buffer.from("SECRET-ARTIST"))).toBe(false);
    expect(out.durationMs).toBeGreaterThan(1500);
    expect(out.durationMs).toBeLessThan(2600);
    expect(out.peaks).toHaveLength(64);
    expect(out.peaks!.every((p) => Number.isInteger(p) && p >= 0 && p <= 100)).toBe(true);
    expect(Math.max(...out.peaks!)).toBeGreaterThan(20); // a sine is not silence
    expect(out.frames).toEqual([]);
    expect((await processMedia(ogg, "AUDIO")).mime).toBe("audio/ogg");
  });
  it("a video declared as audio, or audio declared as video, is refused — the content decides", async () => {
    await expect(processMedia(mp4, "AUDIO")).rejects.toMatchObject({ code: "MEDIA_WRONG_KIND" });
    await expect(processMedia(m4a, "VIDEO")).rejects.toMatchObject({ code: "MEDIA_WRONG_KIND" });
  });
  it("a file that is not media (or is truncated) is refused by name, never stored", async () => {
    await expect(processMedia(Buffer.from("not media at all"), "VIDEO")).rejects.toBeInstanceOf(MediaRefusal);
    await expect(processMedia(mp4.subarray(0, 700), "VIDEO")).rejects.toBeInstanceOf(MediaRefusal);
  });
  it("a video without sound is still a video (and is judged on its frames)", async () => {
    const out = await processMedia(silentVideo, "VIDEO");
    expect(out.frames).toHaveLength(3);
  });
});
