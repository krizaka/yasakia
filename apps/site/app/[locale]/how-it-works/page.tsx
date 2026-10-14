import type { Metadata } from "next";

import { HowView } from "@/components/views";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return pageMetadata("fr", "how-it-works");
}

export default function Page() {
  return <HowView locale="fr" />;
}
