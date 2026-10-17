import { IntroIcon } from "@krizaka/icons";
import { ConversationItem } from "@krizaka/ui/chat";
import { DashboardLayout, Widget } from "@krizaka/ui/dashboard-layout";
import { EmptyState } from "@krizaka/ui/empty-state";
import type { Metadata } from "next";

import { pageSession } from "@/lib/console-access";
import { asLocale, getDictionary, translator } from "@/lib/i18n";
import { listIntros } from "@/lib/intros";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.shell.myIntros };
}

/** My introductions: the people who said yes to me as I said yes to them — live ones first. */
export default async function IntrosPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const session = await pageSession();
  if (!session) return null;
  const say = translator(locale);
  const t = getDictionary(locale).console.intros;
  const intros = await listIntros(session.account.id);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <DashboardLayout headingAs="h2" title={t.title} description={t.lead}>
      <Widget level={3} title={t.listTitle} span={3}>
        {intros.length ? (
          <ul className="flex flex-col">
            {intros.map((i) => (
              <li key={i.id}>
                <ConversationItem
                  name={i.name || t.someone}
                  href={`/app/${locale}/intros/${i.id}`}
                  preview={i.state === "OPEN" ? say("console.intros.openUntil", { date: day.format(new Date(i.expiresAt)) }) : say(`console.intros.states.${i.state as "OPEN" | "CONTINUED" | "FADED" | "CLOSED"}`)}
                  time={i.lastMessageAt ? day.format(new Date(i.lastMessageAt)) : undefined}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<IntroIcon />} title={t.emptyTitle} description={t.emptyDescription} />
        )}
      </Widget>
    </DashboardLayout>
  );
}
