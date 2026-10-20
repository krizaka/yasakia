import { Timeline } from "@krizaka/ui/activity-feed";
import { Badge } from "@krizaka/ui/badge";
import { Card } from "@krizaka/ui/card";
import { DescriptionList } from "@krizaka/ui/description-list";
import { DetailLayout } from "@krizaka/ui/detail-layout";
import { Stat } from "@krizaka/ui/stat";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountActions } from "@/components/console/AccountActions";
import { UserActions } from "@/components/console/UserActions";
import { userDetail } from "@/lib/admin-users";
import { auditFor } from "@/lib/audit";
import { pageAdmin } from "@/lib/console-access";
import { isUuid } from "@/lib/http";
import { asLocale, getDictionary, translator } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.meta.user };
}

const TONE = { ACTIVE: "success", PAUSED: "neutral", SUSPENDED: "danger" } as const;

/** One account for an administrator: its state and facts, the two actions, and the audit lines about it. 404 unless administrator on an allowed address. */
export default async function UserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = asLocale(raw);
  const admin = await pageAdmin();
  if (!admin || !isUuid(id)) notFound();
  const user = await userDetail(id);
  if (!user) notFound();
  const t = translator(locale);
  const d = getDictionary(locale).console.admin;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const lines = await auditFor(id, 12);
  const agentStates = getDictionary(locale).console.dashboard.agentState;
  // The labels are nested by the action's own dots (« auth.sign_in » → auth → sign_in).
  const actionLabel = (action: string) => action.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], d.audit.actions) as string | undefined;
  return (
    <DetailLayout
      back={<Link href={`/app/${locale}/admin/users`}>{d.user.back}</Link>}
      eyebrow={d.user.eyebrow}
      title={user.email}
      status={
        <Badge tone={TONE[user.status]} dot>
          {d.statuses[user.status]}
        </Badge>
      }
      meta={user.status === "SUSPENDED" && user.suspendedAt ? t("console.admin.user.suspendedSince", { date: when.format(user.suspendedAt) }) : user.displayName}
      actions={<UserActions id={user.id} status={user.status} role={user.role} />}
      aside={
        <Card.Root>
          <Card.Body>
            <Card.Title as="h3">{d.user.facts}</Card.Title>
            <DescriptionList
              layout="inline"
              items={[
                { term: d.user.id, details: <span className="break-all font-mono text-xs">{user.id}</span> },
                { term: d.user.role, details: d.roles[user.role] },
                { term: d.user.language, details: user.locale.toUpperCase() },
                { term: d.user.joined, details: when.format(user.createdAt) },
                { term: d.user.lastSeen, details: user.lastSeenAt ? when.format(user.lastSeenAt) : d.users.never },
                { term: d.user.agent, details: user.agentState ? (agentStates as Record<string, string>)[user.agentState] ?? user.agentState : "—" },
                { term: d.user.signIn, details: user.hasPassword ? d.user.password : d.user.codeOnly },
                ...(user.status === "SUSPENDED" ? [{ term: d.user.reasonLabel, details: user.suspensionReason ?? d.user.noReason }] : []),
              ]}
            />
          </Card.Body>
        </Card.Root>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label={d.user.batches} value={user.counts.batches} />
          <Stat label={d.user.intros} value={user.counts.intros} />
          <Stat label={d.user.reports} value={user.counts.openReportsAgainst} />
          <Stat label={d.user.sessions} value={user.counts.liveSessions} />
        </div>
        <AccountActions id={user.id} email={user.email} role={user.role} self={admin.account.id === user.id} />
        <section aria-labelledby="activity" className="flex flex-col gap-3">
          <h2 id="activity" className="font-display text-lg font-bold text-fg">
            {d.user.activityTitle}
          </h2>
          {lines.length ? (
            <Timeline
              aria-label={d.user.activityLabel}
              locale={locale}
              timeStyle="datetime"
              events={lines.map((l) => ({
                id: l.id,
                at: l.createdAt,
                title: actionLabel(l.action) ?? l.action,
                description: [l.actor, l.detail ? Object.values(l.detail).join(" · ") : null].filter(Boolean).join(" — ") || undefined,
                tone: l.action === "auth.sign_in_refused" || l.action === "admin.suspend" ? ("danger" as const) : undefined,
              }))}
            />
          ) : (
            <p className="text-sm text-fg-secondary">{d.user.activityEmpty}</p>
          )}
          <Link className="w-fit text-sm font-semibold text-fg-accent" href={`/app/${locale}/admin/audit`}>
            {d.user.viewAudit}
          </Link>
        </section>
      </div>
    </DetailLayout>
  );
}
