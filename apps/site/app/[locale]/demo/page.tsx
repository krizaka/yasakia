import type { Metadata } from "next";

import { DemoView } from "@/components/views";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return pageMetadata("fr", "demo");
}

export default function Page() {
  return <DemoView locale="fr" />;
}
