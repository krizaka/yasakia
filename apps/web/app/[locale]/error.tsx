"use client";

import { useParams } from "next/navigation";

import { ServerError } from "@/components/errors/ServerError";

/** The error boundary of the three pages, inside the layout: the falcon explains, in the page's language. */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const params = useParams<{ locale?: string }>();
  return <ServerError locale={params?.locale} digest={error.digest} retry={retry} as="main" />;
}
