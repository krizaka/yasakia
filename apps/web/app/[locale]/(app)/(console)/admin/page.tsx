import { FlagIcon } from "@krizaka/icons";
import { Badge } from "@krizaka/ui/badge";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { EmptyState } from "@krizaka/ui/empty-state";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { overview } from "@/lib/admin-console";
import { pageAdmin } from "@/lib/console-access";
import { signupEnabled } from "@/lib/env";
import { asLocale, getDictionary, translator } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.shell.overview };
}

/** The console's overview — counts only: accounts by status, the moderation queue, introductions, open batches, sign-up. 404 unless administrator on an allowed address. */
export default async function AdminOverview({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  if (!(await pageAdmin())) notFound();
  const t = getDictionary(locale).console.admin.overview;
  const say = translator(locale);
  const o = await overview();
  const big = "font-display text-3xl font-extrabold text-fg";
  return (
    <DashboardLayout headingAs="h2" title={t.title} description={t.description}>
      <Widget level={3} title={t.accounts}>
        <p className={big}>{o.accounts.active}</p>
        <p className="text-sm text-fg-secondary">
          {t.active} · {o.accounts.paused} {t.paused.toLowerCase()} · {o.accounts.suspended} {t.suspended.toLowerCase()}
        </p>
      </Widget>
      <Widget level={3} title={t.reportsOpen} description={o.reports.urgentOpen ? say("console.admin.overview.urgent", { count: o.reports.urgentOpen }) : undefined}>
        <p className={big}>{o.reports.open}</p>
      </Widget>
      <Widget level={3} title={t.introsOpen}>
        <p className={big}>{o.intros.OPEN + o.intros.CONTINUED}</p>
      </Widget>
      <Widget level={3} title={t.batches}>
        <p className={big}>{o.openBatches}</p>
      </Widget>
      <Widget level={3} title={t.moderation} description={t.moderationLine} span={2}>
        {o.reports.open ? (
          <Link className="font-semibold text-fg-accent" href={`/${locale}/admin/reports`}>
            {t.open}
          </Link>
        ) : (
          <EmptyState icon={<FlagIcon />} title={t.queueClear} />
        )}
      </Widget>
      <Widget level={3} title={t.signup} span={2}>
        <Badge tone={signupEnabled() ? "warning" : "success"} dot>
          {signupEnabled() ? t.signupOpen : t.signupClosed}
        </Badge>
      </Widget>
    </DashboardLayout>
  );
}
