import type { Metadata } from "next";

import { type AccountDto,AccountView } from "@/components/console/AccountView";
import { meView } from "@/lib/account";
import { pageSession } from "@/lib/console-access";
import { asLocale, getDictionary } from "@/lib/i18n";
import { hasPassword } from "@/lib/password-auth";
import { describeAgent, listWebSessions } from "@/lib/web-session";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.meta.account };
}

/** Account & settings: profile, what the agent knows, visibility, password, devices, export, deletion — from the person's own rows only. */
export default async function AccountPage() {
  const session = await pageSession();
  if (!session) return null;
  const id = session.account.id;
  const [me, password, sessions] = await Promise.all([meView(id), hasPassword(id), listWebSessions(id, session.sessionId)]);
  const account: AccountDto = {
    email: me.account.email,
    locale: me.account.locale,
    status: me.account.status === "PAUSED" ? "PAUSED" : "ACTIVE",
    displayName: me.profile.displayName,
    hasPassword: password,
    agentState: me.agent.state,
    gender: me.profile.gender,
    seekingGenders: me.profile.seekingGenders,
    ageMin: me.profile.ageMin,
    ageMax: me.profile.ageMax,
    intent: me.profile.intent,
    radiusKm: me.profile.radiusKm,
    precisionM: me.profile.location?.precisionM ?? null,
    sessions: sessions.map((s) => ({ id: s.id, ...describeAgent(s.userAgent), createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.current })),
  };
  return <AccountView account={account} />;
}
