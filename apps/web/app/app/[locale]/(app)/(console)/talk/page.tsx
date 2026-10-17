import type { Metadata } from "next";

import { TalkView } from "@/components/console/TalkView";
import { agentView } from "@/lib/agent";
import { pageSession } from "@/lib/console-access";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.meta.talk };
}

/** The talk-first conversation: the thread with the agent, what it understood in the person's words, the portrait once written. */
export default async function TalkPage() {
  const session = await pageSession();
  if (!session) return null; // the layout has already sent the visitor to sign in
  return <TalkView initial={await agentView(session.account.id)} />;
}
