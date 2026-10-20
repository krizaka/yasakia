"use client";

import { krizakaFetch, useMutation } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Avatar } from "@krizaka/ui/avatar";
import { Button } from "@krizaka/ui/button";
import { ConfirmButton } from "@krizaka/ui/confirm-button";
import { DataTable, type DataTableColumn } from "@krizaka/ui/data-table";
import { DescriptionList } from "@krizaka/ui/description-list";
import { createKrizakaForm } from "@krizaka/ui/form";
import { SettingsLayout, SettingsSection } from "@krizaka/ui/settings-layout";
import { Switch } from "@krizaka/ui/switch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { z } from "zod";

import { BASE_PATH, errorKey } from "@/lib/client";
import { dateFormat } from "@/lib/format-date";
import { useSay } from "@/lib/i18n-client";

import { tableLabels } from "./table";

export interface AccountDto {
  email: string;
  locale: "en" | "fr";
  status: "ACTIVE" | "PAUSED";
  displayName: string | null;
  hasPassword: boolean;
  agentState: string;
  gender: "WOMAN" | "MAN" | "NON_BINARY" | null;
  seekingGenders: ("WOMAN" | "MAN" | "NON_BINARY")[];
  ageMin: number;
  ageMax: number;
  intent: "LONG_TERM" | "OPEN_TO_LONG_TERM" | "CASUAL" | "FRIENDSHIP_FIRST" | "NOT_SURE" | null;
  radiusKm: number;
  precisionM: number | null;
  sessions: { id: string; browser: string; system: string; createdAt: string; lastSeenAt: string; current: boolean }[];
}

const profileForm = createKrizakaForm({
  schema: z.object({ displayName: z.string().trim().min(1).max(40), locale: z.enum(["en", "fr"]) }),
  defaultValues: { displayName: "", locale: "en" as "en" | "fr" },
});
const passwordForm = createKrizakaForm({
  schema: z
    .object({ current: z.string().min(1), next: z.string().min(12, "form.errors.tooShort").max(200), confirm: z.string().min(1) })
    .refine((v) => v.next === v.confirm, { path: ["confirm"], error: "form.errors.passwordsDiffer" }),
  defaultValues: { current: "", next: "", confirm: "" },
});

/** Account & settings on @krizaka/ui's SettingsLayout: each section a titled card with its own save, so one never waits for another. */
export function AccountView({ account }: { account: AccountDto }) {
  const { say, locale } = useSay();
  const router = useRouter();
  const i18n = { t: (key: string, vars?: unknown) => say(key, vars as Record<string, string | number> | undefined), locale };
  const [notice, setNotice] = useState<{ section: string; tone: "success" | "danger"; text: string } | null>(null);
  const say2 = (section: string, tone: "success" | "danger", text: string) => setNotice({ section, tone, text });
  const fail = (section: string, error: unknown) => say2(section, "danger", say(`errors.${errorKey(error)}`));

  const saveProfile = useMutation({ mutationFn: (body: object) => krizakaFetch("/api/me", { method: "PATCH", json: body }) });
  const pause = useMutation({
    mutationFn: (paused: boolean) => krizakaFetch("/api/me", { method: "PATCH", json: { paused } }),
    onSuccess: (_d, paused) => {
      say2("visibility", "success", paused ? say("account.visibility.savedOn") : say("account.visibility.savedOff"));
      router.refresh();
    },
    onError: (e) => fail("visibility", e),
  });
  const changePassword = useMutation({ mutationFn: (body: object) => krizakaFetch("/api/me/password", { method: "POST", json: body }) });
  const endOne = useMutation({
    mutationFn: (id: string) => krizakaFetch(`/api/me/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => router.refresh(),
    onError: (e) => fail("sessions", e),
  });
  const endOthers = useMutation({
    mutationFn: () => krizakaFetch("/api/me/sessions", { method: "DELETE" }),
    onSuccess: () => {
      say2("sessions", "success", say("account.sessions.endedOthers"));
      router.refresh();
    },
    onError: (e) => fail("sessions", e),
  });
  const remove = useMutation({
    mutationFn: () => krizakaFetch("/api/me", { method: "DELETE" }),
    onSuccess: () => {
      router.replace(`/app/${locale}/sign-in`);
      router.refresh();
    },
    onError: (e) => fail("delete", e),
  });

  const profile = profileForm.useForm({
    i18n,
    defaultValues: { displayName: account.displayName ?? "", locale: account.locale },
    onSubmit: async (values) => {
      try {
        await saveProfile.mutateAsync(values);
        if (values.locale !== locale) router.replace(`/app/${values.locale}/account`);
        else {
          say2("profile", "success", say("account.profile.saved"));
          router.refresh();
        }
      } catch (e) {
        fail("profile", e);
      }
    },
  });
  const password = passwordForm.useForm({
    i18n,
    onSubmit: async (values) => {
      try {
        await changePassword.mutateAsync({ current: values.current, next: values.next });
        say2("security", "success", say("account.security.changed"));
        password.reset();
      } catch (e) {
        fail("security", e);
      }
    },
  });

  const when = useMemo(() => dateFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const columns = useMemo<DataTableColumn<AccountDto["sessions"][number]>[]>(
    () => [
      {
        id: "device",
        header: say("account.sessions.device"),
        card: "title",
        value: (s) => `${s.browser} ${s.system}`,
        cell: (s) => [[s.browser, s.system].filter(Boolean).join(" · ") || say("account.sessions.unknown"), s.current ? `(${say("account.sessions.current")})` : ""].filter(Boolean).join(" "),
      },
      { id: "createdAt", header: say("account.sessions.started"), value: (s) => s.createdAt, cell: (s) => <time dateTime={s.createdAt} suppressHydrationWarning>{when.format(new Date(s.createdAt))}</time> },
      { id: "lastSeenAt", header: say("account.sessions.lastUsed"), value: (s) => s.lastSeenAt, cell: (s) => <time dateTime={s.lastSeenAt} suppressHydrationWarning>{when.format(new Date(s.lastSeenAt))}</time> },
      {
        id: "end",
        header: say("account.sessions.end"),
        align: "end",
        cell: (s) => (
          <Button
            size="sm"
            variant="ghost"
            loading={endOne.isPending && endOne.variables === s.id}
            aria-label={say("account.sessions.endLabel", { device: [s.browser, s.system].filter(Boolean).join(" · ") || say("account.sessions.unknown") })}
            onClick={() => endOne.mutate(s.id)}
          >
            {say("account.sessions.end")}
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- endOne's identity changes each render; its pending state is read through `variables`.
    [say, when, endOne.isPending, endOne.variables],
  );
  const labels = useMemo(() => tableLabels(say), [say]);

  const nav = [
    { id: "profile", label: say("account.nav.profile"), href: "#profile" },
    { id: "preferences", label: say("account.nav.preferences"), href: "#preferences" },
    { id: "visibility", label: say("account.nav.visibility"), href: "#visibility" },
    { id: "security", label: say("account.nav.security"), href: "#security" },
    { id: "sessions", label: say("account.nav.sessions"), href: "#sessions" },
    { id: "data", label: say("account.nav.data"), href: "#data" },
    { id: "delete", label: say("account.nav.delete"), href: "#delete" },
  ];
  const note = (section: string) => (notice?.section === section ? <Alert tone={notice.tone}>{notice.text}</Alert> : null);
  const none = say("account.preferences.none");

  return (
    <SettingsLayout className="w-full" title={say("account.title")} description={say("account.description")} nav={nav} navLabel={say("account.navLabel")} linkAs={Link}>
      <SettingsSection id="profile" title={say("account.profile.title")} description={say("account.profile.description")}>
        <div className="mb-4 flex items-center gap-4">
          <Avatar size="lg" alt={say("account.avatar")} defaultAvatar={{ brand: "yasakia", seed: account.email, kind: "person" }} />
        </div>
        <profile.Form method="post" aria-label={say("account.profile.title")} className="flex flex-col gap-4">
          <DescriptionList layout="inline" items={[{ term: say("account.profile.email"), details: account.email, hint: say("account.profile.emailHint") }]} />
          <profile.TextField name="displayName" label={say("account.profile.displayName")} maxLength={40} autoComplete="given-name" />
          <profile.Select
            name="locale"
            label={say("account.profile.language")}
            options={[
              { value: "en", label: say("account.profile.languageEn") },
              { value: "fr", label: say("account.profile.languageFr") },
            ]}
          />
          {note("profile")}
          <div>
            <profile.Submit size="sm">
              {say("account.profile.save")}
            </profile.Submit>
          </div>
        </profile.Form>
      </SettingsSection>

      <SettingsSection id="preferences" title={say("account.preferences.title")} description={say("account.preferences.description")}>
        <DescriptionList
          layout="inline"
          items={[
            { term: say("account.preferences.agentState"), details: say(`dashboard.agentState.${account.agentState}`) },
            { term: say("account.preferences.gender"), details: account.gender ? say(`account.preferences.genders.${account.gender}`) : none },
            { term: say("account.preferences.seeking"), details: account.seekingGenders.length ? account.seekingGenders.map((g) => say(`account.preferences.seekingGenders.${g}`)).join(", ") : none },
            { term: say("account.preferences.ages"), details: say("account.preferences.years", { min: account.ageMin, max: account.ageMax }) },
            { term: say("account.preferences.intent"), details: account.intent ? say(`account.preferences.intents.${account.intent}`) : none },
            { term: say("account.preferences.radius"), details: say("account.preferences.km", { km: account.radiusKm }) },
            { term: say("account.preferences.position"), details: account.precisionM ? say("account.preferences.positionRounded", { meters: account.precisionM }) : none },
          ]}
        />
      </SettingsSection>

      <SettingsSection id="visibility" title={say("account.visibility.title")} description={say("account.visibility.description")}>
        <div className="flex items-center justify-between gap-4 text-sm text-fg">
          <span id="pause-label" className="flex flex-col">
            <span className="font-medium">{say("account.visibility.pause")}</span>
            <span className="text-fg-secondary">{say("account.visibility.pauseHint")}</span>
          </span>
          <Switch aria-labelledby="pause-label" checked={account.status === "PAUSED"} disabled={pause.isPending} onCheckedChange={(on) => pause.mutate(on)} />
        </div>
        {note("visibility")}
      </SettingsSection>

      <SettingsSection id="security" title={say("account.security.title")} description={say("account.security.description")}>
        {account.hasPassword ? (
          <password.Form method="post" aria-label={say("account.security.title")} className="flex flex-col gap-4">
            <password.TextField name="current" label={say("account.security.current")} type="password" autoComplete="current-password" />
            <password.TextField name="next" label={say("account.security.next")} type="password" autoComplete="new-password" hint={say("account.security.hint")} />
            <password.TextField name="confirm" label={say("account.security.confirm")} type="password" autoComplete="new-password" />
            {note("security")}
            <div>
              <password.Submit size="sm">
                {say("account.security.submit")}
              </password.Submit>
            </div>
          </password.Form>
        ) : (
          <p className="text-sm text-fg-secondary">{say("account.security.noPassword")}</p>
        )}
      </SettingsSection>

      <SettingsSection
        id="sessions"
        title={say("account.sessions.title")}
        description={say("account.sessions.description")}
        footer={
          <ConfirmButton size="sm" variant="secondary" confirmLabel={say("account.sessions.endOthersConfirm")} loading={endOthers.isPending} onConfirm={() => endOthers.mutate()}>
            {say("account.sessions.endOthers")}
          </ConfirmButton>
        }
      >
        <DataTable
          caption={say("account.sessions.caption")}
          rows={account.sessions}
          columns={columns}
          getRowId={(s) => s.id}
          rowLabel={(s) => [s.browser, s.system].filter(Boolean).join(" · ") || say("account.sessions.unknown")}
          labels={labels}
          empty={undefined}
        />
        {note("sessions")}
      </SettingsSection>

      <SettingsSection id="data" title={say("account.data.title")} description={say("account.data.description")}>
        <p className="text-sm text-fg-secondary">{say("account.data.exportHint")}</p>
        <div>
          <Button asChild size="sm" variant="secondary">
            <a href={`${BASE_PATH}/api/me/export`} download="yasakia-data.json">
              {say("account.data.export")}
            </a>
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection id="delete" title={say("account.delete.title")} description={say("account.delete.description")}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-secondary marker:text-fg-accent">
          <li>{say("account.delete.now")}</li>
          <li>{say("account.delete.later")}</li>
          <li>{say("account.delete.remains")}</li>
        </ul>
        {note("delete")}
        <div>
          <ConfirmButton size="sm" variant="danger" confirmLabel={say("account.delete.confirm")} loading={remove.isPending} onConfirm={() => remove.mutate()}>
            {say("account.delete.action")}
          </ConfirmButton>
        </div>
      </SettingsSection>
    </SettingsLayout>
  );
}
