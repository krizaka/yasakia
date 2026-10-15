import { PageHeader } from "@krizaka/ui/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IntrosTable } from "@/components/console/IntrosTable";
import { pageAdmin } from "@/lib/console-access";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.shell.intros };
}

/** The introductions overview. 404 unless administrator on an allowed address. */
export default async function IntrosPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!(await pageAdmin())) notFound();
  const t = getDictionary(asLocale((await params).locale)).console.admin.intros;
  return (
    <>
      <PageHeader as="h2" title={t.title} description={t.description} className="mb-6" />
      <IntrosTable />
    </>
  );
}
