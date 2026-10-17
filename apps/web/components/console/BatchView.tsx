"use client";

import { BatchIcon } from "@krizaka/icons";
import { defineKeys, krizakaFetch, useMutation, useQuery, useQueryClient } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Avatar } from "@krizaka/ui/avatar";
import { Badge } from "@krizaka/ui/badge";
import { Button } from "@krizaka/ui/button";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { EmptyState } from "@krizaka/ui/empty-state";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { ButtonLink } from "@/components/console/ButtonLink";
import type { AgentDto } from "@/lib/agent-dto";
import type { BatchView as BatchDto } from "@/lib/batches";
import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

const keys = defineKeys("batch", { current: () => ["current"] });

export interface BatchPageData {
  batch: BatchDto | null;
  state: AgentDto["state"];
}

/**
 * The person's batch. Without one, the way to ask for it once the agent has written the portrait; with one, each
 * person as the agent presents them — their own words, and *why you two* in words, both ways. Never a score.
 */
export function BatchView({ initial }: { initial: BatchPageData }) {
  const { say, locale } = useSay();
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.current(),
    queryFn: ({ signal }) => krizakaFetch("/api/batches/current", { signal }).then((r) => (r as { batch: BatchDto | null }).batch),
    initialData: initial.batch,
    staleTime: 30_000,
  });
  const open = useMutation({
    mutationFn: () => krizakaFetch("/api/batches", { method: "POST", json: { locale } }),
    // The batch is read again (the person sees it at once), and the page — the agent's state — with it.
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.current() });
      router.refresh();
    },
  });
  const batch = query.data;
  const date = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
    return (iso: string) => f.format(new Date(iso));
  }, [locale]);
  const home = `/app/${locale}`;

  return (
    <DashboardLayout headingAs="h2" title={say("shell.batch")} description={say("batch.lead")}>
      {batch ? (
        <>
          <Widget level={3} title={say("batch.openTitle")} description={say("batch.openUntil", { date: date(batch.expiresAt) })} span={3}>
            <div className="flex flex-col gap-2 text-sm text-fg-secondary">
              <Badge tone="success" dot className="w-fit">
                {say("batch.people", { count: batch.people.length })}
              </Badge>
              <p>{say("batch.noScore")}</p>
              <p className="text-fg-muted">{say("batch.next")}</p>
            </div>
          </Widget>
          {batch.people.map((p) => (
            <Widget key={p.id} level={3} title={p.name || say("batch.someone")} description={p.fictional ? say("batch.fictional") : undefined} span={3}>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Avatar size="lg" alt="" defaultAvatar={{ brand: "yasakia", seed: p.id, kind: "person" }} />
                <div className="flex min-w-0 flex-1 flex-col gap-4 text-sm text-fg-secondary">
                  {p.fictional ? (
                    <Badge tone="warning" size="sm" className="w-fit">
                      {say("batch.fictionalBadge")}
                    </Badge>
                  ) : null}
                  {p.about ? (
                    <div>
                      <p className="font-semibold text-fg">{say("batch.inTheirWords")}</p>
                      <p>{p.about}</p>
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="font-semibold text-fg">{say("batch.whyYou")}</p>
                      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 marker:text-fg-accent">
                        {p.reasons.forYou.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-fg">{say("batch.whyThem")}</p>
                      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 marker:text-fg-accent">
                        {p.reasons.forThem.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </Widget>
          ))}
        </>
      ) : (
        <Widget level={3} title={say("batch.emptyTitle")} span={3}>
          {initial.state === "WAITING_POOL" ? (
            <div className="flex flex-col gap-4">
              <EmptyState icon={<BatchIcon />} title={say("batch.readyTitle")} description={say("batch.readyDescription")} />
              {open.isError ? <Alert tone="info" title={say(`errors.${errorKey(open.error)}`)} /> : null}
              <Button shape="cut" variant="primary" loading={open.isPending} onClick={() => open.mutate()} className="w-fit">
                {open.isPending ? say("batch.looking") : say("batch.look")}
              </Button>
            </div>
          ) : initial.state === "ONBOARDING" ? (
            <div className="flex flex-col gap-4">
              <EmptyState icon={<BatchIcon />} title={say("batch.talkFirstTitle")} description={say("batch.talkFirstDescription")} />
              <ButtonLink href={`${home}/talk`} shape="cut" variant="primary" className="w-fit">
                {say("talk.dashboardAction")}
              </ButtonLink>
            </div>
          ) : (
            <EmptyState icon={<BatchIcon />} title={say("batch.emptyTitle")} description={say("batch.emptyDescription")} />
          )}
        </Widget>
      )}
    </DashboardLayout>
  );
}
