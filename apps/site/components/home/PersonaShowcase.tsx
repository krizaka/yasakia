"use client";

import { type ShowcaseStep,StepShowcase } from "@krizaka/ui/step-showcase";

import { format } from "@/lib/i18n";

/** The StepShowcase needs a function for « Step n of m »: a client component builds it from the message (a server one cannot pass it). */
export function PersonaShowcase({ label, steps, play, pause, stepOf }: { label: string; steps: readonly ShowcaseStep[]; play: string; pause: string; stepOf: string }) {
  return <StepShowcase label={label} steps={steps} device="phone" labels={{ play, pause, step: (n, total) => format(stepOf, { n, total }) }} data-testid="persona-showcase" />;
}
