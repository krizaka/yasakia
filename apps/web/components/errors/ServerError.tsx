"use client";

import { Button, buttonVariants } from "@krizaka/ui/button";
import { useTransition } from "react";

import { errorStrings } from "@/lib/error-strings";
import { contactHref } from "@/lib/site";

import { PageState } from "./PageState";

/**
 * What a page shows when it failed on the server: the falcon says it was on our side and nothing is lost, then Try
 * again (Next's `retry`: re-fetch and re-render) and Contact us — with the error reference (Next's digest, the number in the logs).
 */
export function ServerError({ locale, digest, retry, as }: { locale?: string; digest?: string; retry: () => void; as?: "section" | "main" }) {
  const t = errorStrings(locale);
  const [pending, startTransition] = useTransition();
  return (
    <PageState
      as={as}
      bird="falcon"
      mood="error"
      eyebrow={t("serverEyebrow")}
      title={t("serverTitle")}
      body={t("serverBody")}
      actions={
        <>
          <Button size="lg" shape="pill" loading={pending} onClick={() => startTransition(() => retry())}>
            {pending ? t("retrying") : t("retry")}
          </Button>
          <a href={contactHref("yasakia-error")} className={buttonVariants({ variant: "ghost", size: "lg", shape: "pill" })}>
            {t("contact")}
          </a>
        </>
      }
      reference={
        digest ? (
          <p className="inline-flex items-center gap-2 rounded-sm border border-border-default bg-surface-1/80 px-4 py-1 text-xs">
            <span className="text-fg-muted">{t("reference")}</span>
            <code className="select-all font-mono text-fg">{digest}</code>
          </p>
        ) : undefined
      }
    />
  );
}
