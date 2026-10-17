import type { Metadata } from "next";

import { BatchView } from "@/components/console/BatchView";
import { agentView } from "@/lib/agent";
import { currentBatch } from "@/lib/batches";
import { pageSession } from "@/lib/console-access";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.meta.batch };
}

/** The batch: three to five people who fit both ways, and why you two — in words, both ways. */
export default async function BatchPage() {
  const session = await pageSession();
  if (!session) return null; // the layout has already sent the visitor to sign in
  const [batch, agent] = await Promise.all([currentBatch(session.account.id), agentView(session.account.id)]);
  return <BatchView initial={{ batch, state: agent.state }} />;
}
