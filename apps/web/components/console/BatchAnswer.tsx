"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Badge } from "@krizaka/ui/badge";
import { Button } from "@krizaka/ui/button";
import { z } from "zod";

import { ButtonLink } from "@/components/console/ButtonLink";
import type { Decision } from "@/lib/batch-rules";
import type { BatchPersonView } from "@/lib/batches";
import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

const Answer = z.object({ decision: z.string(), lookingFor: z.string().nullable(), introId: z.string().nullable(), debriefDue: z.boolean() });

/** One person of the batch: what they hope for (once asked), and the three answers — yes, tell me more (once), pass. */
export function BatchAnswer({ batchId, person, open, onAnswered }: { batchId: string; person: BatchPersonView; open: boolean; onAnswered: () => Promise<void> }) {
  const { say, locale } = useSay();
  const answer = useMutation({
    mutationFn: (decision: Decision) => krizakaFetch(`/api/batches/${batchId}/items/${person.id}/decision`, { method: "POST", json: { decision }, schema: Answer }),
    onSuccess: onAnswered,
  });
  const final = person.decision === "INTERESTED" || person.decision === "PASS";
  const introId = answer.data?.introId ?? null;
  return (
    <div className="flex flex-col gap-3">
      {person.lookingFor ? (
        <div>
          <p className="font-semibold text-fg">{say("batch.answer.lookingFor")}</p>
          <p>{person.lookingFor}</p>
        </div>
      ) : null}
      {person.decision === "INTERESTED" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success" dot>
            {say("batch.answer.saidYes")}
          </Badge>
          <ButtonLink href={introId ? `/app/${locale}/intros/${introId}` : `/app/${locale}/intros`} size="sm" variant="secondary">
            {say("batch.answer.toIntros")}
          </ButtonLink>
        </div>
      ) : person.decision === "PASS" ? (
        <Badge tone="neutral">{say("batch.answer.passed")}</Badge>
      ) : null}
      {!final && open ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={say("batch.answer.label", { name: person.name || say("batch.someone") })}>
          <Button size="sm" variant="primary" loading={answer.isPending && answer.variables === "INTERESTED"} disabled={answer.isPending} onClick={() => answer.mutate("INTERESTED")}>
            {say("batch.answer.interested")}
          </Button>
          {person.decision !== "TELL_ME_MORE" ? (
            <Button size="sm" variant="secondary" loading={answer.isPending && answer.variables === "TELL_ME_MORE"} disabled={answer.isPending} onClick={() => answer.mutate("TELL_ME_MORE")}>
              {say("batch.answer.tellMeMore")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" loading={answer.isPending && answer.variables === "PASS"} disabled={answer.isPending} onClick={() => answer.mutate("PASS")}>
            {say("batch.answer.pass")}
          </Button>
        </div>
      ) : null}
      {answer.isError ? <Alert tone="danger" title={say(`errors.${errorKey(answer.error)}`)} /> : null}
    </div>
  );
}
