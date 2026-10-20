"use client";

import { useEffect, useRef } from "react";

/**
 * The real take, playing inside a phone: a muted, looping recording of Camille's run on the development site. The poster is
 * the first screen (it paints at once: the LCP never waits for the video); the video starts by itself only where it is welcome —
 * never under reduced motion, never with Save-Data, never on a slow connection (the poster stays).
 */
export function TakeVideo({ webm, mp4, poster, alt }: { webm: string; mp4: string; poster: string; alt: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const welcome = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !connection?.saveData && !/^(slow-2g|2g)$/.test(connection?.effectiveType ?? "");
    if (welcome) void el.play().catch(() => undefined);
  }, []);

  return (
    <video ref={ref} className="block aspect-[406/880] w-full bg-surface-0 object-cover" poster={poster} muted loop playsInline preload="metadata" aria-label={alt} data-testid="take-video">
      <source src={webm} type="video/webm" />
      <source src={mp4} type="video/mp4" />
    </video>
  );
}
