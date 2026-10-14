import { YasakiaLogo } from "@krizaka/ui";
import { AuthLayout } from "@krizaka/ui/auth-layout";
import { Mascot } from "@krizaka/ui/mascots";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/console/SignInForm";
import { pageSession } from "@/lib/console-access";
import { asLocale, getDictionary } from "@/lib/i18n";
import { contactHref } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.console.meta.signIn, robots: { index: false, follow: false } };
}

/** Sign-in on the product's auth template: the brand panel beside a calm form. Sign-up is closed — the page says so. */
export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  if (await pageSession()) redirect(`/${locale}`);
  const t = getDictionary(locale).console.signIn;
  return (
    <AuthLayout
      brand={
        <>
          <YasakiaLogo size={28} /> Yasakia
        </>
      }
      promise={t.promise}
      aside={<Mascot bird="lovebird" mood="welcome" size={72} />}
      asideFooter={t.asideFooter}
      title={t.title}
      description={t.description}
      footer={
        <>
          <strong className="block font-semibold text-fg">{t.closedTitle}</strong>
          <span className="block">{t.closed}</span>{" "}
          <a className="font-semibold text-fg-accent" href={contactHref("yasakia-sign-in")}>
            {t.contact}
          </a>
        </>
      }
      legal={
        <>
          {t.legalPrefix}{" "}
          <Link className="underline" href={`/${locale}/terms`}>
            {t.terms}
          </Link>{" "}
          {t.legalAnd}{" "}
          <Link className="underline" href={`/${locale}/privacy`}>
            {t.privacy}
          </Link>
          .
        </>
      }
    >
      <SignInForm next={`/${locale}`} />
    </AuthLayout>
  );
}
