"use client";

import { ImageIcon, PlayIcon, VideoIcon } from "@krizaka/icons";
import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { AudioPlayer } from "@krizaka/ui/audio-player";
import { Button } from "@krizaka/ui/button";
import { VideoPlayer } from "@krizaka/ui/video-player";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { BASE_PATH, errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";
import type { IntroDetail } from "@/lib/intros";

type Kind = "PHOTO" | "VIDEO" | "AUDIO";

const ACCEPT: Record<Kind, string> = { PHOTO: "image/jpeg,image/png,image/webp", VIDEO: "video/mp4,video/webm,video/quicktime", AUDIO: "audio/mp4,audio/x-m4a,audio/webm,audio/ogg,audio/mpeg,audio/wav" };
const Started = z.object({ messageId: z.string(), upload: z.object({ url: z.string() }) });

interface Picked {
  file: File;
  kind: Kind;
  url: string;
  durationMs: number | null;
}

/** The upload URL the server signs is absolute; the browser calls the same origin under the app's base path. */
function sameOrigin(url: string): string {
  const u = new URL(url);
  return `${BASE_PATH}${u.pathname}${u.search}`;
}

function limitsProblem(kind: Kind, file: File, durationMs: number | null, limits: IntroDetail["mediaLimits"]): { key: string; max: number } | null {
  const maxBytes = kind === "PHOTO" ? limits.photoMaxBytes : kind === "VIDEO" ? limits.videoMaxBytes : limits.audioMaxBytes;
  if (file.size > maxBytes) return { key: "tooLarge", max: Math.round(maxBytes / 1_000_000) };
  const maxSeconds = kind === "VIDEO" ? limits.videoMaxSeconds : kind === "AUDIO" ? limits.audioMaxSeconds : null;
  if (maxSeconds !== null && durationMs !== null && durationMs > maxSeconds * 1000) return { key: "tooLong", max: maxSeconds };
  return null;
}

/**
 * Photo, video, voice message: **capture or pick, then send** — nothing here edits (no filter, trim or effect). The file is checked
 * against the limits (the MEDIA rule set, told before it is sent; the server measures again), shown as it will be seen, and sent as it is.
 * The other person sees it once it has passed the safety check.
 */
export function MediaPicker({ introId, limits, disabled, onSent }: { introId: string; limits: IntroDetail["mediaLimits"]; disabled: boolean; onSent: () => Promise<unknown> }) {
  const { say } = useSay();
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [problem, setProblem] = useState<{ key: string; max?: number } | null>(null);

  useEffect(() => () => (picked ? URL.revokeObjectURL(picked.url) : undefined), [picked]);

  const send = useMutation({
    mutationFn: async (p: Picked) => {
      const started = await krizakaFetch(`/api/intros/${introId}/media`, { method: "POST", json: { kind: p.kind, contentType: p.file.type, bytes: p.file.size, ...(p.durationMs !== null ? { durationMs: p.durationMs } : {}), clientId: crypto.randomUUID() }, schema: Started });
      const put = await fetch(sameOrigin(started.upload.url), { method: "PUT", headers: { "content-type": p.file.type }, body: p.file });
      if (!put.ok) throw new Error("upload");
      await krizakaFetch(`/api/intros/${introId}/media/${started.messageId}/complete`, { method: "PUT" });
    },
    onSuccess: async () => {
      setPicked(null);
      await onSent();
    },
  });

  const choose = (kind: Kind) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProblem(null);
    send.reset();
    const url = URL.createObjectURL(file);
    if (kind === "PHOTO") {
      const found = limitsProblem(kind, file, null, limits);
      if (found) {
        URL.revokeObjectURL(url);
        return setProblem(found);
      }
      return setPicked({ file, kind, url, durationMs: null });
    }
    // The length, as the browser reads it: the server measures the file again and has the last word.
    const element = document.createElement(kind === "VIDEO" ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const durationMs = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : null;
      const found = limitsProblem(kind, file, durationMs, limits);
      if (found) {
        URL.revokeObjectURL(url);
        return setProblem(found);
      }
      setPicked({ file, kind, url, durationMs });
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      setProblem({ key: "unreadable" });
    };
    element.src = url;
  };

  const sizeMb = (bytes: number) => (bytes / 1_000_000).toFixed(1);
  const title = picked ? say(`intros.media.title.${picked.kind}`, { duration: picked.durationMs ? `${Math.floor(picked.durationMs / 60_000)}:${String(Math.floor((picked.durationMs % 60_000) / 1000)).padStart(2, "0")}` : "" }) : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={say("intros.media.attach")}>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || send.isPending} onClick={() => photoRef.current?.click()}>
          <ImageIcon size={16} /> {say("intros.media.photo")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || send.isPending} onClick={() => videoRef.current?.click()}>
          <VideoIcon size={16} /> {say("intros.media.video")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || send.isPending} onClick={() => audioRef.current?.click()}>
          <PlayIcon size={16} /> {say("intros.media.voice")}
        </Button>
        <input ref={photoRef} type="file" accept={ACCEPT.PHOTO} capture="environment" hidden onChange={choose("PHOTO")} data-testid="media-photo" />
        <input ref={videoRef} type="file" accept={ACCEPT.VIDEO} capture="environment" hidden onChange={choose("VIDEO")} data-testid="media-video" />
        <input ref={audioRef} type="file" accept={ACCEPT.AUDIO} capture hidden onChange={choose("AUDIO")} data-testid="media-audio" />
        <span className="text-xs text-fg-muted">{say("intros.media.limits", { photo: sizeMb(limits.photoMaxBytes), video: limits.videoMaxSeconds, voice: Math.round(limits.audioMaxSeconds / 60) })}</span>
      </div>
      {problem ? <Alert tone="danger" title={say(`intros.media.problem.${problem.key}`, { max: problem.max ?? 0 })} /> : null}
      {picked ? (
        <div className="flex max-w-72 flex-col gap-2 rounded-lg border border-border-default p-3">
          {picked.kind === "PHOTO" ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the file the person just chose
            <img src={picked.url} alt={title} className="max-h-60 w-full rounded-md object-cover" />
          ) : picked.kind === "VIDEO" ? (
            <VideoPlayer src={picked.url} title={title} aspectRatio="9 / 16" preload="metadata" />
          ) : (
            <AudioPlayer src={picked.url} title={title} computePeaks duration={picked.durationMs ? picked.durationMs / 1000 : undefined} />
          )}
          <p className="text-xs text-fg-muted">{say("intros.media.asIs", { size: sizeMb(picked.file.size) })}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="primary" shape="cut" loading={send.isPending} onClick={() => send.mutate(picked)}>
              {say("intros.media.send")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={send.isPending} onClick={() => setPicked(null)}>
              {say("intros.media.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {send.isError ? <Alert tone="danger" title={send.error instanceof Error && send.error.message === "upload" ? say("intros.media.problem.upload") : say(`errors.${errorKey(send.error)}`)} /> : null}
    </div>
  );
}
