import type { Metadata } from "next";

import { HomeView } from "@/components/views";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return pageMetadata("en", "home");
}

export default function Page() {
  return <HomeView locale="en" />;
}
