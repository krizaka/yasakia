import { CheckIcon, ShieldIcon } from "@krizaka/icons";
import { DeviceFrame } from "@krizaka/ui/step-showcase";

import { getDictionary, type Locale } from "@/lib/i18n";

/**
 * The hero's product: a phone, drawn in HTML (sharp at any width, painted at once — no recording on the first screen), showing
 * what Yasakia promises first: real people (the photo rule, ticked) and a message that is yours (the mark before it). It shows
 * rules the product enforces, never a person, a profile or a number that does not exist.
 */
export function HeroPhone({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.hero;
  const checks = [t.checkFace, t.checkWords, t.checkAge];
  return (
    <div className="flex justify-center py-2" role="img" aria-label={t.visualAlt}>
      <DeviceFrame kind="phone" className="w-[15.5rem] max-w-full">
        <div className="flex flex-col gap-3 bg-surface-0 px-4 pb-4 pt-8 text-start" aria-hidden>
          <p className="m-0 font-mono text-[11px] uppercase tracking-wider text-fg-muted">{t.profile}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={i < 4 ? "aspect-[3/4] rounded-lg bg-accent/25 ring-1 ring-border-default" : "aspect-[3/4] rounded-lg border border-dashed border-border-default"} />
            ))}
          </div>
          <p className="m-0 text-sm font-semibold text-fg">{t.photosOk}</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {checks.map((c) => (
              <li key={c} className="flex items-start gap-2 text-xs leading-snug text-fg-secondary">
                <span className="mt-px shrink-0 text-fg-accent [&_svg]:size-3.5">
                  <CheckIcon />
                </span>
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-1 rounded-xl border border-border-default bg-surface-1 p-3">
            <p className="m-0 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-accent">
              <span className="[&_svg]:size-3.5">
                <ShieldIcon />
              </span>
              {t.stamp}
            </p>
            <p className="mt-1.5 mb-0 text-xs leading-snug text-fg-secondary">{t.mine}</p>
          </div>
        </div>
      </DeviceFrame>
    </div>
  );
}
