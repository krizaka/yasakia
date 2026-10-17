import { Funnel } from "@krizaka/charts/funnel";
import { AreaChart } from "@krizaka/charts/line";
import { EmptyState } from "@krizaka/ui/empty-state";
import { PageHeader } from "@krizaka/ui/page-header";
import { Stat, StatGrid } from "@krizaka/ui/stat";
import { addDays, format } from "date-fns";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsKind, type Funnel as FunnelData, type Insights, kindCount, productAnalytics } from "@/lib/analytics";
import { pageAdmin } from "@/lib/console-access";
import { analyticsConnection, setting } from "@/lib/env";
import { asLocale, getDictionary, translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.shell.analytics };
}

const TILES = [AnalyticsKind.Talk, AnalyticsKind.BatchOpen, AnalyticsKind.BatchAnswer, AnalyticsKind.IntroStart, AnalyticsKind.ReportFiled] as const;

/**
 * The product's analytics, computed by Orazaka from the events Yasakia sends (krizaka/yasakia#86): people active, the
 * loop's figures against the period before, the days, the funnel batch → answer → introduction and who comes back.
 * Counts only, never a person; nothing about fewer than the engine's audience threshold.
 */
export default async function AnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  if (!(await pageAdmin())) notFound();
  const t = getDictionary(locale).console.admin.analytics;
  const say = translator(locale);
  const conn = analyticsConnection();
  const days = setting("APP_ANALYTICS_CONSOLE_DAYS", 28, 7, 366);
  const now = new Date();
  const header = <PageHeader as="h2" title={t.title} description={say("console.admin.analytics.description", { days })} className="mb-6" />;
  if (!conn) return <>{header}<EmptyState title={t.offTitle} description={t.offBody} /></>;

  let data: { insights: Insights; funnel: FunnelData } | null = null;
  try {
    data = await productAnalytics(conn, format(addDays(now, 1 - days), "yyyy-MM-dd"), format(addDays(now, 1), "yyyy-MM-dd"));
  } catch (error) {
    console.warn("[analytics] console read failed:", (error as Error).message);
  }
  if (!data) return <>{header}<EmptyState title={t.unavailableTitle} description={t.unavailableBody} /></>;
  const { insights, funnel } = data;
  if (insights.suppressed || !insights.activeSubjects) {
    return <>{header}<EmptyState title={t.smallTitle} description={say("console.admin.analytics.smallBody", { min: insights.minAudience })} /></>;
  }
  const trend = (change: number | null) => (change === null || change === 0 ? undefined : change > 0 ? "up" : "down");
  const pct = (change: number | null) => (change === null ? undefined : `${change > 0 ? "+" : ""}${Math.round(change * 100)} %`);
  const steps = funnel.steps.filter((s) => !s.suppressed && s.subjects !== null).map((s) => ({ label: t.kinds[s.kind as keyof typeof t.kinds] ?? s.kind, subjects: s.subjects ?? 0 }));
  const series = insights.series.map((d) => ({ day: d.day, people: d.activeSubjects }));

  return (
    <>
      {header}
      <StatGrid minWidth={150}>
        <Stat label={t.people} value={insights.activeSubjects.current} trend={trend(insights.activeSubjects.change)} trendLabel={pct(insights.activeSubjects.change)} hint={t.vsBefore} />
        {TILES.map((kind) => {
          const { value } = kindCount(insights, kind);
          const k = insights.kinds.find((x) => x.kind === kind);
          return <Stat key={kind} label={t.kinds[kind]} value={value ?? say("console.admin.analytics.hidden", { min: insights.minAudience })} trend={trend(k?.count.change ?? null)} trendLabel={pct(k?.count.change ?? null)} />;
        })}
      </StatGrid>
      <section className="mt-8">
        <AreaChart title={t.daily} data={series} x="day" xFormat="day" xLabel={t.day} y="people" yLabel={t.people} height={220} />
      </section>
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        {steps.length >= 2 ? (
          <Funnel title={t.funnel} description={t.funnelHint} data={steps} label={(s) => s.label} value="subjects" height={200} />
        ) : (
          <p className="text-sm text-fg-muted">{say("console.admin.analytics.funnelEmpty", { min: insights.minAudience })}</p>
        )}
        <div>
          <h3 className="text-sm font-bold text-fg">{t.cohorts}</h3>
          {insights.cohorts.length === 0 ? (
            <p className="mt-2 text-sm text-fg-muted">{say("console.admin.analytics.cohortsEmpty", { min: insights.minAudience })}</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {insights.cohorts.map((c) => (
                <li key={c.week} className="flex justify-between text-sm text-fg">
                  <span>{say("console.admin.analytics.cohortLine", { week: c.week, size: c.size })}</span>
                  <span className="font-mono text-xs text-fg-secondary">{c.retention.map((r) => `${Math.round(r * 100)} %`).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
