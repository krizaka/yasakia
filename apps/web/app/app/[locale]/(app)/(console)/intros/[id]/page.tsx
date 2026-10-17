import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IntroView } from "@/components/console/IntroView";
import { pageSession } from "@/lib/console-access";
import { HttpError } from "@/lib/http";
import { asLocale, getDictionary } from "@/lib/i18n";
import { introDetail } from "@/lib/intros";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.shell.myIntros };
}

/** One introduction: our messages, « continue ». Someone else's is a 404. */
export default async function IntroPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const session = await pageSession();
  if (!session) return null;
  if (!UUID.test(id)) notFound();
  const intro = await introDetail(session.account.id, id.toLowerCase()).catch((error: unknown) => {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  });
  if (!intro) notFound();
  return <IntroView initial={intro} />;
}
