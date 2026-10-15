import { PageHeader } from "@krizaka/ui/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuditTable } from "@/components/console/AuditTable";
import { pageAdmin } from "@/lib/console-access";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.meta.audit };
}

/** The audit log of the administration console. Not an administrator, or not on an allowed address: a 404. */
export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!(await pageAdmin())) notFound();
  const t = getDictionary(asLocale((await params).locale)).console.admin.audit;
  return (
    <>
      <PageHeader as="h2" title={t.title} description={t.description} className="mb-6" />
      <AuditTable />
    </>
  );
}
