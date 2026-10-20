import { DeviceFrame } from "@krizaka/ui/step-showcase";

import { getDictionary, type Locale } from "@/lib/i18n";
import { take } from "@/lib/media";

import { TakeVideo } from "./TakeVideo";

/**
 * The hero's product: a phone playing the real take — Camille's photos checked by the engine, on the development site, no
 * drawing in its place. The poster is the first frame of the recording (painted at once); a screen of grey tiles and ticked
 * rules stood here before and said nothing true. The recording is on Bunny (lib/media.ts), never in this repository.
 */
export function HeroPhone({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.hero;
  const media = take("hero", locale);
  return (
    <div className="flex justify-center py-2">
      <DeviceFrame kind="phone" className="w-[15.5rem] max-w-full">
        <TakeVideo webm={media.webm} mp4={media.mp4} poster={media.poster} alt={t.visualAlt} />
      </DeviceFrame>
    </div>
  );
}
