import type { Metadata } from "next";

import { HomeView } from "@/components/views";
import { getDictionary } from "@/lib/i18n";

export function generateMetadata(): Metadata {
  const t = getDictionary("fr");
  return { title: { absolute: t.meta.siteName }, description: t.meta.description, alternates: { canonical: "/fr/", languages: { en: "/" } } };
}

export default function Page() {
  return <HomeView locale="fr" />;
}
