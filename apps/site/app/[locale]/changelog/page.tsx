import type { Metadata } from "next";

import { ChangelogView } from "@/components/ChangelogView";
import { changelogMetadata } from "@/lib/changelog-meta";

export function generateMetadata(): Metadata {
  return changelogMetadata("fr");
}

export default function Page() {
  return <ChangelogView locale="fr" />;
}
