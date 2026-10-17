import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomizationView } from "@/components/console/CustomizationView";
import { pageAdmin } from "@/lib/console-access";
import { getActiveCustomization } from "@/lib/customization";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.admin.customization.title };
}

export default async function AdminCustomizationPage() {
  if (!(await pageAdmin())) notFound();

  const { version, config } = await getActiveCustomization();

  return <CustomizationView initialConfig={config} version={version} />;
}
