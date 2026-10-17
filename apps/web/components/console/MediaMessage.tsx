"use client";

import { krizakaFetch, useQuery } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { AudioPlayer } from "@krizaka/ui/audio-player";
import { Badge } from "@krizaka/ui/badge";
import { Spinner } from "@krizaka/ui/spinner";
import { VideoPlayer } from "@krizaka/ui/video-player";
import { z } from "zod";

import { useSay } from "@/lib/i18n-client";
import type { IntroMessageView } from "@/lib/intros";

const Signed = z.object({ media: z.object({ url: z.string(), posterUrl: z.string().nullable() }) });

const seconds = (ms: number | null) => (ms === null ? "" : `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`);

/**
 * A photo, a video or a voice message in the thread. Nothing here edits it: it plays as it was sent. Its file is read through a URL
 * signed for this reader (300 s). The other person never sees it before the safety check passed; the sender sees where it stands —
 * « checking », or why it was refused (codes, worded here).
 */
export function MediaMessage({ introId, message }: { introId: string; message: IntroMessageView }) {
  const { say } = useSay();
  const media = message.media;
  const readable = media !== null && (media.status === "APPROVED" || (message.mine && media.status === "PENDING"));
  const signed = useQuery({
    queryKey: ["intro", introId, "media", message.id],
    queryFn: ({ signal }) => krizakaFetch(`/api/intros/${introId}/media/${message.id}`, { signal, schema: Signed }).then((r) => r.media),
    enabled: readable,
    staleTime: 240_000, // @fixed: the signed URL lives 300 seconds
  });
  if (!media) return null;
  const title = say(`intros.media.title.${media.kind}`, { duration: seconds(media.durationMs) });

  if (media.status === "UPLOADING") {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-fg-muted" role="status">
        <Spinner size="sm" label={say("intros.media.uploading")} /> {say("intros.media.uploading")}
      </p>
    );
  }
  if (media.status === "REJECTED") {
    return (
      <Alert tone="danger" title={say("intros.media.refused")}>
        <ul className="list-disc pl-5">
          {media.codes.map((code) => (
            <li key={code}>{say(`intros.media.codes.${code}`)}</li>
          ))}
        </ul>
      </Alert>
    );
  }
  if (media.status === "GONE") return <p className="text-sm text-fg-muted">{say("intros.media.gone")}</p>;

  return (
    <div className="flex w-full max-w-72 flex-col gap-2">
      {message.mine && media.status === "PENDING" ? (
        <Badge tone="neutral" size="sm" className="w-fit">
          {say("intros.media.checking")}
        </Badge>
      ) : null}
      {!signed.data ? (
        signed.isError ? (
          <p className="text-sm text-fg-muted">{say("intros.media.unavailable")}</p>
        ) : (
          <Spinner size="sm" label={title} />
        )
      ) : media.kind === "PHOTO" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL on another origin; the Optimizer is not used for message media
        <img src={signed.data.url} alt={title} className="max-h-80 w-full rounded-lg object-cover" loading="lazy" />
      ) : media.kind === "VIDEO" ? (
        <VideoPlayer src={signed.data.url} poster={signed.data.posterUrl ?? undefined} title={title} aspectRatio="9 / 16" preload="metadata" />
      ) : (
        <AudioPlayer src={signed.data.url} title={title} peaks={media.waveform ?? undefined} duration={media.durationMs ? media.durationMs / 1000 : undefined} />
      )}
    </div>
  );
}
