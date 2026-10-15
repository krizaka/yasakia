import type { Metadata } from "next";

import { DashboardView } from "@/components/console/DashboardView";
import { pageSession } from "@/lib/console-access";
import { dashboardDto, dashboardFor } from "@/lib/dashboard";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.meta.dashboard };
}

/** The person's home after sign-in — the agent, the batch, the introductions, the phones — rendered here, kept fresh by the live stream. */
export default async function DashboardPage() {
  const session = await pageSession();
  if (!session) return null; // the layout has already sent the visitor to sign in
  return <DashboardView initial={dashboardDto(await dashboardFor(session.account.id))} />;
}
