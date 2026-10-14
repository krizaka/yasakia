"use client";

import { ClockIcon, HomeIcon, LogoutIcon, SettingsIcon, UsersIcon } from "@krizaka/icons";
import { krizakaFetch, useMutation } from "@krizaka/query";
import { YasakiaLogo } from "@krizaka/ui";
import { AppShell } from "@krizaka/ui/app-shell";
import { Button } from "@krizaka/ui/button";
import { ThemeToggle } from "@krizaka/ui/theme";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useSay } from "@/lib/i18n-client";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

/**
 * The frame of the signed-in space: @krizaka/ui's AppShell (sidebar that folds to its icons and opens as a drawer on a
 * phone, a header with the page's title), the person's destinations, and — only for an administrator on an allowed
 * address — the administration group. The page's own title is the header's h1.
 */
export function ConsoleShell({ locale, email, admin, children }: { locale: "en" | "fr"; email: string; admin: boolean; children: React.ReactNode }) {
  const { say } = useSay();
  const router = useRouter();
  const path = usePathname() ?? "";
  const home = `/${locale}`;
  const other = locale === "en" ? "fr" : "en";
  const rest = path.slice(`/${locale}`.length);
  const signOut = useMutation({
    mutationFn: () => krizakaFetch("/api/auth/sign-out", { method: "POST" }),
    onSettled: () => {
      router.replace(`/${locale}/sign-in`);
      router.refresh();
    },
  });
  const current = (to: string, exact = false) => (exact ? path === to : path === to || path.startsWith(`${to}/`));
  const titleKey = path.startsWith(`${home}/admin/audit`)
    ? "shell.audit"
    : path.startsWith(`${home}/admin/users`)
      ? "shell.users"
      : path.startsWith(`${home}/account`)
        ? "shell.account"
        : "shell.dashboard";
  const item = (to: string, label: string, icon: React.ReactNode, exact = false) => (
    <AppShell.Item asChild label={label} icon={icon} current={current(to, exact)}>
      <Link href={to}>{label}</Link>
    </AppShell.Item>
  );
  return (
    <AppShell.Root skipLabel={say("shell.skip")}>
      <AppShell.Sidebar
        label={say("shell.sidebarLabel")}
        brand={
          <Link href={home} className="inline-flex items-center gap-2">
            <YasakiaLogo size={24} animated={false} /> Yasakia
          </Link>
        }
        closeLabel={say("shell.closeMenu")}
        collapseLabels={[say("shell.collapse"), say("shell.expand")]}
        footer={
          <div className="flex flex-col gap-1 px-3 pb-2 text-xs text-fg-muted">
            <span className="truncate" title={email}>
              {say("shell.signedInAs", { email })}
            </span>
            {VERSION ? <span>{say("shell.devBuild", { version: VERSION })}</span> : null}
          </div>
        }
      >
        <AppShell.Group>{say("shell.groupYou")}</AppShell.Group>
        {item(home, say("shell.dashboard"), <HomeIcon />, true)}
        {item(`${home}/account`, say("shell.account"), <SettingsIcon />)}
        {admin ? (
          <>
            <AppShell.Group>{say("shell.groupAdmin")}</AppShell.Group>
            {item(`${home}/admin/users`, say("shell.users"), <UsersIcon />)}
            {item(`${home}/admin/audit`, say("shell.audit"), <ClockIcon />)}
          </>
        ) : null}
      </AppShell.Sidebar>
      <AppShell.Body>
        <AppShell.Header
          title={say(titleKey)}
          menuLabel={say("shell.openMenu")}
          actions={
            <>
              <Link href={`/${other}${rest}`} hrefLang={other} lang={other} className="rounded-md px-2 py-1 text-sm text-fg-secondary hover:text-fg">
                <span className="sr-only">{say("shell.language")} · </span>
                {say("shell.otherLanguage")}
              </Link>
              <ThemeToggle label={say("shell.theme")} variant="ghost" />
              <Button size="sm" variant="secondary" shape="cut" loading={signOut.isPending} onClick={() => signOut.mutate()}>
                <LogoutIcon size={16} /> {say("shell.signOut")}
              </Button>
            </>
          }
        />
        <AppShell.Main>{children}</AppShell.Main>
      </AppShell.Body>
    </AppShell.Root>
  );
}
