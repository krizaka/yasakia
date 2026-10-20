"use client";

import { BatchIcon, ChatIcon, FilterIcon, HomeIcon, ImageIcon, IntroIcon, LogoutIcon, ServerIcon, SettingsIcon, ShieldIcon, UsersIcon } from "@krizaka/icons";
import { krizakaFetch, useMutation } from "@krizaka/query";
import { YasakiaLogo } from "@krizaka/ui";
import { AppShell } from "@krizaka/ui/app-shell";
import { Badge } from "@krizaka/ui/badge";
import { Button } from "@krizaka/ui/button";
import { languageNames,LanguageSwitch } from "@krizaka/ui/language-switch";
import { ThemeToggle } from "@krizaka/ui/theme";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ACCOUNT_HREF, ADMIN_NAV, currentEntry, type NavEntry, USER_NAV } from "@/lib/console-nav";
import { useSay } from "@/lib/i18n-client";

import { ButtonLink } from "./ButtonLink";

/** The icon of each entry (structure lives in lib/console-nav.ts). */
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <HomeIcon />,
  talk: <ChatIcon />,
  photos: <ImageIcon />,
  batch: <BatchIcon />,
  myIntros: <IntroIcon />,
  overview: <ShieldIcon />,
  users: <UsersIcon />,
  intros: <IntroIcon />,
  rules: <FilterIcon />,
  system: <ServerIcon />,
};

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

/**
 * The frame of the signed-in space: @krizaka/ui's AppShell (sidebar that folds to its icons and opens as a drawer on a
 * phone, a header with the page's title), the person's destinations, and — only for an administrator on an allowed
 * address — the administration group. The page's own title is the header's h1.
 */
export function ConsoleShell({ locale, email, admin, adminOnly = false, children }: { locale: "en" | "fr"; email: string; admin: boolean; adminOnly?: boolean; children: React.ReactNode }) {
  const { say } = useSay();
  const router = useRouter();
  const path = usePathname() ?? "";
  const home = `/app/${locale}`;
  const rest = path.slice(home.length);
  const signOut = useMutation({
    mutationFn: () => krizakaFetch("/api/auth/sign-out", { method: "POST" }),
    onSettled: () => {
      router.replace(`/app/${locale}/sign-in`);
      router.refresh();
    },
  });
  const current = (to: string, exact = false) => (exact ? path === to : path === to || path.startsWith(`${to}/`));
  const inAdmin = path.startsWith(`${home}/admin`);
  const where = currentEntry(inAdmin ? ADMIN_NAV : USER_NAV, path, home);
  const titleKey = where ? where.page.label : path.startsWith(`${home}${ACCOUNT_HREF}`) ? "account" : "dashboard";
  const item = (to: string, label: string, icon: React.ReactNode, exact = false, entry?: NavEntry) => (
    <AppShell.Item asChild label={label} icon={icon} current={entry ? where?.entry === entry : current(to, exact)}>
      <Link href={to}>{label}</Link>
    </AppShell.Item>
  );
  return (
    <AppShell.Root skipLabel={say("shell.skip")}>
      <AppShell.Sidebar
        label={say("shell.sidebarLabel")}
        brand={
          <Link href={home} className="inline-flex items-center gap-2">
            <YasakiaLogo size={24} animated={false} /> {adminOnly ? say("shell.adminBrand") : "Yasakia"}
          </Link>
        }
        closeLabel={say("shell.closeMenu")}
        collapseLabels={[say("shell.collapse"), say("shell.expand")]}
        footer={
          <div className="flex flex-col gap-1 px-3 pb-2 text-xs text-fg-muted">
            {adminOnly ? null : (
              <Link href={`${home}${ACCOUNT_HREF}`} className="inline-flex items-center gap-2 rounded-md py-1 text-fg-secondary hover:text-fg" aria-current={path.startsWith(`${home}${ACCOUNT_HREF}`) ? "page" : undefined}>
                <SettingsIcon size={14} /> {say("shell.account")}
              </Link>
            )}
            <span className="truncate" title={email}>
              {say("shell.signedInAs", { email })}
            </span>
            {VERSION ? <span>{say("shell.devBuild", { version: VERSION })}</span> : null}
          </div>
        }
      >
        {adminOnly ? null : (
          <>
            <AppShell.Group>{say("shell.groupYou")}</AppShell.Group>
            {USER_NAV.map((entry) => item(`${home}${entry.href}`, say(`shell.${entry.label}`), ICONS[entry.label], entry.href === ""))}
          </>
        )}
        {admin ? (
          <>
            <AppShell.Group>{say("shell.groupAdmin")}</AppShell.Group>
            {ADMIN_NAV.map((entry) => item(`${home}${entry.href}`, say(`shell.${entry.label}`), ICONS[entry.label], entry.href === "/admin", entry))}
          </>
        ) : null}
      </AppShell.Sidebar>
      <AppShell.Body>
        <AppShell.Header
          title={say(`shell.${titleKey}`)}
          menuLabel={say("shell.openMenu")}
          actions={
            <>
              {adminOnly ? (
                <>
                  <Badge tone="warning" size="sm" className="hidden sm:inline-flex">
                    {say("shell.devBadge", { version: VERSION })}
                  </Badge>
                  <Badge tone="warning" size="sm" className="sm:hidden">
                    {say("shell.devShort")}
                  </Badge>
                </>
              ) : null}
              <LanguageSwitch label={say("shell.language")} current={locale} languages={(["en", "fr"] as const).map((code) => ({ code, name: languageNames[code] ?? code, href: `/app/${code}${rest}` }))} linkAs={Link} />
              <ThemeToggle label={say("shell.theme")} variant="ghost" />
              <Button size="sm" variant="secondary" loading={signOut.isPending} onClick={() => signOut.mutate()}>
                <LogoutIcon size={16} /> <span className="max-sm:sr-only">{say("shell.signOut")}</span>
              </Button>
            </>
          }
        />
        <AppShell.Main>
          {where && where.entry.pages.length > 1 ? (
            <nav aria-label={say(`shell.${where.entry.label}`)} className="mb-4 flex flex-wrap gap-2">
              {where.entry.pages.map((page) => (
                <ButtonLink key={page.href} href={`${home}${page.href}`} size="sm" variant={page === where.page ? "secondary" : "ghost"} aria-current={page === where.page ? "page" : undefined}>
                  {say(`shell.${page.label}`)}
                </ButtonLink>
              ))}
            </nav>
          ) : null}
          {children}
        </AppShell.Main>
      </AppShell.Body>
    </AppShell.Root>
  );
}
