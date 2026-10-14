import { ConsoleProviders } from "@/components/console/ConsoleProviders";
import { asLocale, getDictionary } from "@/lib/i18n";

/** Everything the signed-in console and its sign-in page share: the language slice and the query client. */
export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const { console: messages } = getDictionary(locale);
  return (
    <ConsoleProviders locale={locale} messages={{ console: messages }}>
      {children}
    </ConsoleProviders>
  );
}
