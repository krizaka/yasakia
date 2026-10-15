import { Badge } from "@krizaka/ui/badge";
import { DescriptionList } from "@krizaka/ui/description-list";
import { Meter } from "@krizaka/ui/meter";
import { PageHeader } from "@krizaka/ui/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { healthReport } from "@/lib/admin-console";
import { pageAdmin } from "@/lib/console-access";
import { asLocale, getDictionary, translator } from "@/lib/i18n";
import { budgetShare } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.shell.health };
}

/** This instance's health and version, as the console shows it. 404 unless administrator on an allowed address. */
export default async function HealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  if (!(await pageAdmin())) notFound();
  const t = getDictionary(locale).console.admin.health;
  const say = translator(locale);
  const h = await healthReport();
  const up = h.uptimeSeconds < 3600 ? say("console.admin.health.minutes", { count: Math.max(1, Math.round(h.uptimeSeconds / 60)) }) : say("console.admin.health.hours", { count: Math.round(h.uptimeSeconds / 3600) });
  return (
    <>
      <PageHeader as="h2" title={t.title} description={t.description} className="mb-6" />
      <DescriptionList
        layout="inline"
        items={[
          { term: t.status, details: <Badge tone={h.status === "ok" ? "success" : "danger"} dot>{h.status === "ok" ? t.ok : t.degraded}</Badge> },
          { term: t.database, details: h.database ? t.up : t.down },
          { term: t.realtime, details: h.realtime === "connected" ? t.connected : t.idle },
          { term: t.version, details: <span className="font-mono">{h.version}</span> },
          { term: t.environment, details: h.environment },
          { term: t.uptime, details: up },
          { term: t.node, details: <span className="font-mono">{h.node}</span> },
        ]}
      />
      {h.connections ? (
        <section aria-labelledby="pool-title" className="mt-8 flex max-w-xl flex-col gap-3">
          <h2 id="pool-title" className="font-display text-base font-bold text-fg">{t.poolTitle}</h2>
          <Meter showLabel thresholds={{ low: 0.7, high: 0.9 }} label={say("console.admin.health.pool", { busy: h.connections.pool.total - h.connections.pool.idle, open: h.connections.pool.total, max: h.connections.pool.max })} value={budgetShare(h.connections.pool.total - h.connections.pool.idle, h.connections.pool.max)} max={1} />
          <Meter showLabel thresholds={{ low: 0.7, high: 0.9 }} label={say("console.admin.health.connections", { open: h.connections.open, limit: h.connections.limit })} value={budgetShare(h.connections.open, h.connections.limit)} max={1} />
          <p className="text-xs text-fg-muted">{say("console.admin.health.waiting", { count: h.connections.pool.waiting })}</p>
        </section>
      ) : null}
      {h.queues ? (
        <section aria-labelledby="queues-title" className="mt-8 max-w-xl">
          <h2 id="queues-title" className="mb-3 font-display text-base font-bold text-fg">{t.queuesTitle}</h2>
          <DescriptionList
            layout="inline"
            items={[
              { term: t.openReports, details: <Badge tone={h.queues.openReports > 0 ? "warning" : "neutral"}>{h.queues.openReports}</Badge> },
              { term: t.urgentReports, details: <Badge tone={h.queues.urgentReports > 0 ? "danger" : "neutral"}>{h.queues.urgentReports}</Badge> },
              { term: t.photosPending, details: <Badge tone={h.queues.photosPending > 0 ? "warning" : "neutral"}>{h.queues.photosPending}</Badge> },
              { term: t.purgesPending, details: <Badge tone="neutral">{h.queues.purgesPending}</Badge> },
              { term: t.purgesFailing, details: <Badge tone={h.queues.purgesFailing > 0 ? "danger" : "neutral"}>{h.queues.purgesFailing}</Badge> },
              { term: t.refusedSignIns, details: <Badge tone={h.queues.refusedSignIns24h > 10 ? "warning" : "neutral"}>{h.queues.refusedSignIns24h}</Badge> },
            ]}
          />
        </section>
      ) : null}
    </>
  );
}
