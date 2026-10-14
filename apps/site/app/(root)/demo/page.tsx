import type { Metadata } from "next";

import { DemoView } from "@/components/views";
import { getDictionary } from "@/lib/i18n";

export function generateMetadata(): Metadata {
  const t = getDictionary("en");
  return { title: t.demo.title, description: t.meta.description, alternates: { canonical: "/demo/", languages: { fr: "/fr/demo/" } } };
}

export default function Page() {
  return <DemoView locale="en" />;
}
