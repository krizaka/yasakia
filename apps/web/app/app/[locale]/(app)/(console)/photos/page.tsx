import type { Metadata } from "next";

import { PhotosView } from "@/components/console/PhotosView";
import { pageSession } from "@/lib/console-access";
import { faceComparisonEnabled } from "@/lib/env";
import { asLocale, getDictionary } from "@/lib/i18n";
import { photoCheckView } from "@/lib/photo-check";
import { listOwnPhotos } from "@/lib/photos";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(asLocale((await params).locale)).console.meta.photos };
}

/** The person's photos: six slots, Orazaka's check of the set in words, and what it looks at (and does not). */
export default async function PhotosPage() {
  const session = await pageSession();
  if (!session) return null;
  const [photos, check] = await Promise.all([listOwnPhotos(session.account.id), photoCheckView(session.account.id, faceComparisonEnabled())]);
  return <PhotosView initial={{ photos: photos.map((p) => ({ id: p.id, position: p.position, status: p.status })), check }} />;
}
