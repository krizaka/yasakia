import { YasakiaLogo } from "@krizaka/ui";
import { AuthLayout } from "@krizaka/ui/auth-layout";
import { Mascot } from "@krizaka/ui/mascots";
import type { Metadata } from "next";
import Link from "next/link";

import { signupEnabled } from "@/lib/env";
import { asLocale, getDictionary } from "@/lib/i18n";
import { contactHref } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.console.meta.signUp, robots: { index: false, follow: false } };
}

/**
 * Registration, built and disabled by configuration: while AUTH_SIGNUP_ENABLED is not `true` the page says the sign-up is
 * closed and offers no form. The server refuses new people in the same way (lib/sign-in.ts).
 */
export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale).console;
  const open = signupEnabled();
  return (
    <AuthLayout
      brand={
        <>
          <YasakiaLogo size={28} /> Yasakia
        </>
      }
      promise={t.signIn.promise}
      aside={<Mascot bird="lovebird" mood="welcome" size={72} />}
      asideFooter={t.signIn.asideFooter}
      title={t.reset.signUpTitle}
      description={open ? t.reset.signUpDescription : undefined}
      footer={
        open ? null : (
          <>
            <strong className="block font-semibold text-fg">{t.reset.closedTitle}</strong>
            <span className="block">{t.reset.closed}</span>{" "}
            <a className="font-semibold text-fg-accent" href={contactHref("yasakia-sign-up")}>
              {t.reset.contact}
            </a>
          </>
        )
      }
    >
      <Link className="font-semibold text-fg-accent" href={`/app/${locale}/sign-in`}>
        {t.reset.back}
      </Link>
    </AuthLayout>
  );
}
