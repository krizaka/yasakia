"use client";

import { defineKeys, keepPreviousData, krizakaFetch, useQuery } from "@krizaka/query";
import { Badge } from "@krizaka/ui/badge";
import { DataTable, type DataTableColumn, DataTableFilters, type DataTableQuery } from "@krizaka/ui/data-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useSay } from "@/lib/i18n-client";

import { listParams, tableLabels } from "./table";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  status: "ACTIVE" | "PAUSED" | "SUSPENDED";
  role: "USER" | "ADMIN";
  locale: "en" | "fr";
  createdAt: string;
  lastSeenAt: string | null;
}
interface UserPage {
  rows: UserRow[];
  total: number;
}

const keys = defineKeys("admin-users", { list: (query: DataTableQuery) => [query] });
const NONE: UserRow[] = [];
const TONE = { ACTIVE: "success", PAUSED: "neutral", SUSPENDED: "danger" } as const;

/** Every account, on the server: search, status and role filters, sort and pages go to `/api/admin/users`; the previous page stays while the next loads. */
export function UsersTable() {
  const { say, locale } = useSay();
  const [query, setQuery] = useState<DataTableQuery>({ sort: { column: "createdAt", direction: "descending" }, filters: {}, page: 1, pageSize: 25 });
  const list = useQuery({
    queryKey: keys.list(query),
    queryFn: ({ signal }) =>
      krizakaFetch("/api/admin/users", {
        signal,
        query: {
          ...listParams(query),
          search: typeof query.filters.email === "string" ? query.filters.email : undefined,
          status: query.filters.status as string[] | undefined,
          role: query.filters.role as string[] | undefined,
        },
      }) as Promise<UserPage>,
    placeholderData: keepPreviousData,
    meta: { list: true },
  });
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  const columns = useMemo<DataTableColumn<UserRow>[]>(
    () => [
      {
        id: "email",
        header: say("admin.users.email"),
        sortable: true,
        filter: "text",
        card: "title",
        cell: (u) => (
          <Link href={`/${locale}/admin/users/${u.id}`} className="font-medium text-fg-accent underline-offset-4 hover:underline" aria-label={say("admin.users.open", { email: u.email })}>
            {u.email}
          </Link>
        ),
      },
      { id: "name", header: say("admin.users.name"), value: (u) => u.displayName ?? "" },
      {
        id: "status",
        header: say("admin.users.status"),
        sortable: true,
        filter: "facet",
        options: (["ACTIVE", "PAUSED", "SUSPENDED"] as const).map((s) => ({ value: s, label: say(`admin.statuses.${s}`) })),
        value: (u) => u.status,
        cell: (u) => (
          <Badge tone={TONE[u.status]} dot size="sm">
            {say(`admin.statuses.${u.status}`)}
          </Badge>
        ),
      },
      {
        id: "role",
        header: say("admin.users.role"),
        filter: "facet",
        options: (["USER", "ADMIN"] as const).map((r) => ({ value: r, label: say(`admin.roles.${r}`) })),
        value: (u) => u.role,
        cell: (u) => say(`admin.roles.${u.role}`),
      },
      { id: "locale", header: say("admin.users.language"), value: (u) => u.locale, cell: (u) => u.locale.toUpperCase() },
      { id: "createdAt", header: say("admin.users.joined"), sortable: true, value: (u) => u.createdAt, cell: (u) => date.format(new Date(u.createdAt)) },
      { id: "lastSeenAt", header: say("admin.users.lastSeen"), sortable: true, value: (u) => u.lastSeenAt ?? "", cell: (u) => (u.lastSeenAt ? date.format(new Date(u.lastSeenAt)) : say("admin.users.never")) },
    ],
    [say, locale, date],
  );
  const labels = useMemo(() => tableLabels(say), [say]);
  return (
    <DataTable
      caption={say("admin.users.caption")}
      rows={list.data?.rows ?? NONE}
      columns={columns}
      getRowId={(u) => u.id}
      rowLabel={(u) => u.email}
      manual={{ sorting: true, filtering: true, pagination: true }}
      rowCount={list.data?.total}
      defaultPageSize={25}
      pageSizeOptions={[10, 25, 50, 100]}
      defaultSort={{ column: "createdAt", direction: "descending" }}
      onStateChange={setQuery}
      loading={list.isPending}
      error={list.error ? say(`errors.load`) : undefined}
      labels={labels}
      toolbar={<DataTableFilters />}
    />
  );
}
