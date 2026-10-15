import { Badge } from "@krizaka/ui/badge";
import { DescriptionList } from "@krizaka/ui/description-list";
import { PageHeader } from "@krizaka/ui/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { healthReport } from "@/lib/admin-console";
import { pageAdmin } from "@/lib/console-access";
import { asLocale, getDictionary, translator } from "@/lib/i18n";

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
    </>
  );
}
