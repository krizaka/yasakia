import { YasakiaLogo } from "@krizaka/ui";
import { AuthLayout } from "@krizaka/ui/auth-layout";
import { Mascot } from "@krizaka/ui/mascots";
import type { Metadata } from "next";

import { ResetForm } from "@/components/console/ResetForm";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.console.meta.forgot, robots: { index: false, follow: false } };
}

/** "Forgot password" on the product's auth template: a code by e-mail, then a new password. */
export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale).console;
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
      title={t.reset.title}
      description={t.reset.description}
    >
      <ResetForm locale={locale} signInHref={`/app/${locale}/sign-in`} />
    </AuthLayout>
  );
}
