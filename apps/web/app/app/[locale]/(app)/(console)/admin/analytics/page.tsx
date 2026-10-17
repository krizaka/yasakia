import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsView } from "@/components/console/AnalyticsView";
import { getAnalyticsReport } from "@/lib/analytics";
import { pageAdmin } from "@/lib/console-access";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.admin.analytics.title };
}

export default async function AdminAnalyticsPage() {
  if (!(await pageAdmin())) notFound();

  const report = await getAnalyticsReport();

  return <AnalyticsView report={report} />;
}
