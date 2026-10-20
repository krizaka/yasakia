"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { createKrizakaForm } from "@krizaka/ui/form";
import { useState } from "react";
import { z } from "zod";

import { DEBRIEF_QUESTIONS } from "@/lib/batch-rules";
import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

const chip = z.string().min(1, "form.errors.required");
const debrief = createKrizakaForm({
  schema: z.object({ rangTrue: chip, mattered: chip, next: chip, text: z.string().trim().max(500, "form.errors.tooLong") }),
  defaultValues: { rangTrue: "", mattered: "", next: "", text: "" },
});

/** The debrief before the next batch: three questions answered with chips, a few words if the person likes (two minutes). */
export function DebriefForm({ batchId, onDone }: { batchId: string; onDone: () => Promise<void> }) {
  const { say, locale } = useSay();
  const [problem, setProblem] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (answers: { questionId: string; chips: string[]; text?: string }[]) => krizakaFetch(`/api/batches/${batchId}/debrief`, { method: "POST", json: { answers } }),
    onSuccess: onDone,
  });
  const form = debrief.useForm({
    i18n: { t: (key, vars) => say(key, vars as Record<string, string | number> | undefined), locale },
    onSubmit: async (v) => {
      setProblem(null);
      const text = v.text.trim();
      try {
        await send.mutateAsync([
          { questionId: "rangTrue", chips: [v.rangTrue] },
          { questionId: "mattered", chips: [v.mattered] },
          { questionId: "next", chips: [v.next], ...(text ? { text } : {}) },
        ]);
      } catch (error) {
        setProblem(say(`errors.${errorKey(error)}`));
      }
    },
  });
  return (
    <form.Form method="post" aria-label={say("batch.debrief.title")} className="flex flex-col gap-5">
      {DEBRIEF_QUESTIONS.map((q) => (
        <form.RadioGroup
          key={q.id}
          name={q.id}
          label={say(`batch.debrief.${q.id}.question`)}
          variant="buttons"
          orientation="horizontal"
          options={q.chips.map((c) => ({ value: c, label: say(`batch.debrief.${q.id}.chips.${c}`) }))}
        />
      ))}
      <form.TextArea name="text" label={say("batch.debrief.text")} hint={say("batch.debrief.textHint")} maxLength={500} />
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      <form.Submit variant="primary" className="w-fit">
        {say("batch.debrief.submit")}
      </form.Submit>
    </form.Form>
  );
}
