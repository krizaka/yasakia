"use client";

import { useEffect, useRef, useState } from "react";

export interface Cue {
  /** Seconds from the start. */
  at: number;
  text: string;
}

/**
 * A recording of the real journey, shown the way Krizaka shows one: a poster first, loaded only when asked
 * (`preload="none"`), no autoplay (so reduced motion is respected without a check), a muted loop-free player with
 * controls — and the captions in the page, in the reader's language, not burned into the picture. The captions follow the
 * playhead (`aria-live`, polite); the same lines are listed below as a transcript, readable without playing anything.
 */
export function CaptionedVideo({ webm, mp4, poster, label, cues, transcriptLabel }: { webm: string; mp4: string; poster: string; label: string; cues: readonly Cue[]; transcriptLabel: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const update = () => {
      let index = -1;
      for (let i = 0; i < cues.length; i++) if (cues[i].at <= el.currentTime) index = i;
      setActive(index);
    };
    el.addEventListener("timeupdate", update);
    el.addEventListener("seeked", update);
    return () => {
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("seeked", update);
    };
  }, [cues]);

  return (
    <figure className="flex flex-col gap-3">
      <video ref={video} className="w-full rounded-2xl border border-border-default bg-surface-1" poster={poster} controls playsInline muted preload="none" aria-label={label}>
        <source src={webm} type="video/webm" />
        <source src={mp4} type="video/mp4" />
      </video>
      <p aria-live="polite" className="min-h-12 rounded-lg bg-surface-1 px-3 py-2 text-sm text-fg-secondary">
        {active >= 0 ? cues[active].text : cues[0]?.text}
      </p>
      <details className="text-sm text-fg-secondary">
        <summary className="cursor-pointer font-semibold text-fg">{transcriptLabel}</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 marker:text-fg-accent">
          {cues.map((c) => (
            <li key={c.at}>{c.text}</li>
          ))}
        </ol>
      </details>
    </figure>
  );
}
