"use client";

import { Badge } from "@krizaka/ui/badge";
import { Tooltip } from "@krizaka/ui/tooltip";

import type { AuthenticitySignal } from "@/lib/authenticity-rules";
import { useSay } from "@/lib/i18n-client";

const TONE = { HAND: "success", UNSURE: "neutral", LIKELY_GENERATED: "warning", TOO_SHORT: "neutral" } as const;

/**
 * The small indicator before a message, shown to both people: three honest words and a fourth for texts too short — a SIGNAL,
 * never a verdict, never a number. The tooltip (also read by keyboard and screen readers) says what it means and that it can be
 * wrong. It never held a message back; while it is being read the mark says so.
 */
export function AuthenticityMark({ signal }: { signal: AuthenticitySignal | null }) {
  const { say } = useSay();
  const key = signal ?? "PENDING";
  const label = say(`intros.authenticity.${key}.label`);
  return (
    <Tooltip content={<span className="block max-w-64 text-sm">{say(`intros.authenticity.${key}.hint`)} {say("intros.authenticity.canBeWrong")}</span>}>
      <button type="button" className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={`${label}. ${say(`intros.authenticity.${key}.hint`)} ${say("intros.authenticity.canBeWrong")}`}>
        <Badge tone={signal ? TONE[signal] : "neutral"} size="sm" dot={signal === "HAND" || signal === "LIKELY_GENERATED"}>
          {label}
        </Badge>
      </button>
    </Tooltip>
  );
}
