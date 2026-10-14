import type { Metadata } from "next";

import { DemoView } from "@/components/views";
import { getDictionary } from "@/lib/i18n";

export function generateMetadata(): Metadata {
  const t = getDictionary("fr");
  return { title: t.demo.title, description: t.meta.description, alternates: { canonical: "/fr/demo/", languages: { en: "/demo/" } } };
}

export default function Page() {
  return <DemoView locale="fr" />;
}
