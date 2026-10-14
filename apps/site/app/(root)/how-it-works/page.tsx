import type { Metadata } from "next";

import { HowView } from "@/components/views";
import { getDictionary } from "@/lib/i18n";

export function generateMetadata(): Metadata {
  const t = getDictionary("en");
  return { title: t.how.title, description: t.meta.description, alternates: { canonical: "/how-it-works/", languages: { fr: "/fr/how-it-works/" } } };
}

export default function Page() {
  return <HowView locale="en" />;
}
