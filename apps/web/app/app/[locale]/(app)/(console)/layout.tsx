import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ConsoleShell } from "@/components/console/ConsoleShell";
import { pageAdmin, pageSession } from "@/lib/console-access";
import { hostKind } from "@/lib/host";
import { asLocale } from "@/lib/i18n";

// The signed-in space is never indexed and never cached: it reads the session on every request.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The signed-in space: no session, no page (the sign-in page). On the admin host (APP_ADMIN_HOST) it is the administration
 * console only — an administrator on an allowed address, or a 404 —; elsewhere it is the person's space, with the
 * administration group for an administrator when no admin host is configured (local development).
 */
export default async function ConsoleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const session = await pageSession();
  if (!session) redirect(`/app/${locale}/sign-in`);
  const adminOnly = hostKind(await headers()) === "admin";
  const admin = (await pageAdmin()) !== null;
  if (adminOnly && !admin) notFound();
  return (
    <ConsoleShell locale={locale} email={session.account.email} admin={admin && hostKind(await headers()) !== "app"} adminOnly={adminOnly}>
      {children}
    </ConsoleShell>
  );
}
