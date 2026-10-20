"use client";

import { BatchIcon, ChatIcon, IntroIcon, NotificationIcon } from "@krizaka/icons";
import { defineKeys, eventSourceLive, krizakaFetch, useLiveInvalidation, useQuery } from "@krizaka/query";
import { Badge } from "@krizaka/ui/badge";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { EmptyState } from "@krizaka/ui/empty-state";
import { Stat } from "@krizaka/ui/stat";
import { useMemo } from "react";

import { ButtonLink } from "@/components/console/ButtonLink";
import { BASE_PATH } from "@/lib/client";
import type { DashboardDto } from "@/lib/dashboard";
import { dateFormat } from "@/lib/format-date";
import { useSay } from "@/lib/i18n-client";

const keys = defineKeys("dashboard", { me: () => ["me"] });

/** Ids only travel on the stream (`batch.ready`, `intro.opened`, `intro.message`): an event refetches the home. */
const EVENTS = ["batch.ready", "intro.opened", "intro.message"] as const;

function useDate(locale: string) {
  return useMemo(() => {
    const f = dateFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    return (iso: string) => f.format(new Date(iso));
  }, [locale]);
}

/**
 * The person's home. The page renders it from the server (`initial`); a live stream (`@krizaka/query` over the account's
 * SSE) refetches it when a batch is ready, an introduction opens or someone writes.
 */
export function DashboardView({ initial }: { initial: DashboardDto }) {
  const { say, locale } = useSay();
  const date = useDate(locale);
  const live = useMemo(() => (typeof window === "undefined" ? null : eventSourceLive(`${BASE_PATH}/api/events`)), []);
  const query = useQuery({
    queryKey: keys.me(),
    queryFn: ({ signal }) => krizakaFetch("/api/me/dashboard", { signal }).then((r) => (r as { dashboard: DashboardDto }).dashboard),
    initialData: initial,
    staleTime: 30_000,
    meta: { list: true },
  });
  for (const type of EVENTS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- EVENTS is a constant tuple: the hooks run in the same order every render.
    useLiveInvalidation(live, { [type]: [keys.me()] }, { channel: type });
  }
  const d = query.data;
  const home = `/app/${locale}`;
  const batchOpen = d.batch !== null;
  return (
    <DashboardLayout
      headingAs="h2"
      title={d.displayName ? say("dashboard.greeting", { name: d.displayName }) : say("dashboard.greetingAnonymous")}
      description={d.accountStatus === "PAUSED" ? say("dashboard.paused") : say("dashboard.lead")}
    >
      <Widget level={3} title={say("dashboard.stats.agent")} description={say(`dashboard.agentHint.${d.agentState}`)}>
        <div className="flex flex-col gap-3">
          <p className="font-display text-xl font-extrabold text-fg">{say(`dashboard.agentState.${d.agentState}`)}</p>
          {d.agentState === "ONBOARDING" ? (
            <ButtonLink href={`${home}/talk`} size="sm" variant="primary" className="w-fit">
              {say("talk.dashboardAction")}
            </ButtonLink>
          ) : null}
        </div>
      </Widget>
      <Widget level={3} title={say("dashboard.stats.batch")} description={batchOpen ? say("dashboard.batchHintOpen", { decided: d.batch!.decided, count: d.batch!.people }) : say("dashboard.batchHintNone")}>
        <p className="font-display text-xl font-extrabold text-fg">{batchOpen ? say("dashboard.batchValue", { count: d.batch!.people }) : say("dashboard.batchNone")}</p>
      </Widget>
      <Widget level={3} title={say("dashboard.stats.intros")} description={say("dashboard.introsHint", { continued: d.intros.continued })}>
        <p className="font-display text-xl font-extrabold text-fg">{say("dashboard.introsValue", { count: d.intros.open + d.intros.continued })}</p>
      </Widget>
      <Widget level={3} title={say("dashboard.stats.profile")} description={say("dashboard.profileHint")}>
        <p className="font-display text-xl font-extrabold text-fg">{say("dashboard.profileValue", { done: d.profile.done, total: d.profile.total })}</p>
      </Widget>

      <Widget level={3} title={say("dashboard.batchTitle")} description={say("dashboard.batchDescription")} span={2}>
        {d.batch ? (
          <div className="flex flex-col gap-3">
            <Badge tone={d.batch.status === "OPEN" ? "success" : "warning"} dot>
              {d.batch.status === "OPEN" ? say("dashboard.batchStatusOpen") : say("dashboard.batchStatusDebrief")}
            </Badge>
            <Stat label={say("dashboard.stats.batch")} value={say("dashboard.batchValue", { count: d.batch.people })} hint={say("dashboard.batchEnds", { date: date(d.batch.expiresAt) })} />
          </div>
        ) : (
          <EmptyState icon={<BatchIcon />} title={say("dashboard.batchEmptyTitle")} description={say("dashboard.batchEmptyDescription")} />
        )}
      </Widget>

      <Widget level={3} title={say("dashboard.introsTitle")} description={say("dashboard.introsDescription")} span={2}>
        {d.conversations.length ? (
          <ul className="flex flex-col gap-2">
            {d.conversations.map((c) => (
              <li key={c.introId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2 text-fg">
                  <ChatIcon size={16} />
                  <Badge tone={c.state === "CONTINUED" ? "success" : "accent"} size="sm">
                    {c.state === "CONTINUED" ? say("dashboard.introContinued") : say("dashboard.introOpen")}
                  </Badge>
                  {c.messages ? say("dashboard.introMessages", { count: c.messages }) : say("dashboard.introNoMessages")}
                </span>
                <span className="text-fg-muted">
                  {c.lastMessageAt ? say("dashboard.introLast", { date: date(c.lastMessageAt) }) : say("dashboard.introEnds", { date: date(c.expiresAt) })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<IntroIcon />} title={say("dashboard.introsEmptyTitle")} description={say("dashboard.introsEmptyDescription")} />
        )}
      </Widget>

      <Widget level={3} title={say("dashboard.notificationsTitle")} description={say("dashboard.notificationsDescription")} span={2}>
        {d.notifications.phones ? (
          <div className="flex flex-col gap-2 text-sm text-fg-secondary">
            <p className="inline-flex items-center gap-2 text-fg">
              <NotificationIcon size={16} />
              {d.notifications.phones === 1 ? say("dashboard.phones", { count: 1 }) : say("dashboard.phonesMany", { count: d.notifications.phones })}
            </p>
            <p>{say("dashboard.notificationsList")}</p>
            <Badge tone={live ? "success" : "neutral"} dot size="sm" className="w-fit">
              {live ? say("dashboard.live") : say("dashboard.liveOff")}
            </Badge>
          </div>
        ) : (
          <EmptyState icon={<NotificationIcon />} title={say("dashboard.notificationsEmptyTitle")} description={say("dashboard.notificationsEmptyDescription")} />
        )}
      </Widget>

      <Widget level={3} title={say("dashboard.profileTitle")} description={say("dashboard.profileDescription")} span={2}>
        {d.profile.missing.length ? (
          <div className="flex flex-col gap-3">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-secondary marker:text-fg-accent">
              {d.profile.missing.map((m) => (
                <li key={m}>{say(`dashboard.missing.${m}`)}</li>
              ))}
            </ul>
            <ButtonLink href={`${home}/account`} size="sm" variant="secondary" className="w-fit">
              {say("dashboard.profileAction")}
            </ButtonLink>
          </div>
        ) : (
          <p className="text-sm text-fg-secondary">{say("dashboard.profileDone")}</p>
        )}
      </Widget>
    </DashboardLayout>
  );
}
