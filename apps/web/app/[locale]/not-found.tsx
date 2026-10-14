"use client";

import { buttonVariants } from "@krizaka/ui/button";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageState } from "@/components/errors/PageState";
import { errorLocale, errorStrings } from "@/lib/error-strings";
import { contactHref, PRODUCT_URL } from "@/lib/site";

/**
 * Every address of a language that is not one of the three pages: the owl read everything and did not find it. Yasakia
 * lives in its app — the way out is the three pages and the product's page on krizaka.com.
 */
export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = errorLocale(params?.locale);
  const t = errorStrings(locale);
  return (
    <PageState
      as="main"
      bird="owl"
      mood="thinking"
      eyebrow={t("notFoundEyebrow")}
      title={t("notFoundTitle")}
      body={t("notFoundBody")}
      actions={
        <>
          <Link href={`/${locale}/privacy`} className={buttonVariants({ variant: "secondary", size: "lg", shape: "pill" })}>
            {t("privacy")}
          </Link>
          <Link href={`/${locale}/terms`} className={buttonVariants({ variant: "ghost", size: "lg", shape: "pill" })}>
            {t("terms")}
          </Link>
          <Link href={`/${locale}/delete-account`} className={buttonVariants({ variant: "ghost", size: "lg", shape: "pill" })}>
            {t("deleteAccount")}
          </Link>
          <a href={PRODUCT_URL} className={buttonVariants({ variant: "ghost", size: "lg", shape: "pill" })}>
            {t("product")}
          </a>
          <a href={contactHref("yasakia-not-found")} className={buttonVariants({ variant: "ghost", size: "lg", shape: "pill" })}>
            {t("contact")}
          </a>
        </>
      }
    />
  );
}
