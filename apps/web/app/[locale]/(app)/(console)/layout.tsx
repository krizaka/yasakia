import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConsoleShell } from "@/components/console/ConsoleShell";
import { pageAdmin, pageSession } from "@/lib/console-access";
import { asLocale } from "@/lib/i18n";

// The signed-in space is never indexed and never cached: it reads the session on every request.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The signed-in space: no session, no page (the sign-in page); the administration group only for an administrator on an allowed address. */
export default async function ConsoleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const session = await pageSession();
  if (!session) redirect(`/${locale}/sign-in`);
  const admin = (await pageAdmin()) !== null;
  return (
    <ConsoleShell locale={locale} email={session.account.email} admin={admin}>
      {children}
    </ConsoleShell>
  );
}
