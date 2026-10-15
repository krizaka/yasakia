"use client";

import { defineKeys, keepPreviousData, krizakaFetch, useQuery } from "@krizaka/query";
import { DataTable, type DataTableColumn, DataTableFilters, type DataTableQuery } from "@krizaka/ui/data-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useSay } from "@/lib/i18n-client";

import { tableLabels } from "./table";

interface AuditRow {
  id: string;
  action: string;
  actor: string | null;
  targetId: string | null;
  detail: Record<string, string | number | boolean | null> | null;
  ip: string | null;
  createdAt: string;
}

const ACTIONS = ["auth.sign_in", "auth.sign_in_refused", "auth.sign_out", "auth.password_changed", "account.deleted", "admin.suspend", "admin.restore"] as const;
const keys = defineKeys("admin-audit", { list: (query: DataTableQuery) => [query] });
const NONE: AuditRow[] = [];

/** The audit log on the server: search, action filter, order and pages go to `/api/admin/audit`. */
export function AuditTable() {
  const { say, locale } = useSay();
  const [query, setQuery] = useState<DataTableQuery>({ sort: { column: "createdAt", direction: "descending" }, filters: {}, page: 1, pageSize: 25 });
  const list = useQuery({
    queryKey: keys.list(query),
    queryFn: ({ signal }) =>
      krizakaFetch("/api/admin/audit", {
        signal,
        query: { page: query.page, size: query.pageSize, dir: query.sort?.direction === "ascending" ? "asc" : "desc", search: typeof query.filters.actor === "string" ? query.filters.actor : undefined, action: query.filters.action as string[] | undefined },
      }) as Promise<{ rows: AuditRow[]; total: number }>,
    placeholderData: keepPreviousData,
    meta: { list: true },
  });
  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }), [locale]);
  const columns = useMemo<DataTableColumn<AuditRow>[]>(
    () => [
      { id: "createdAt", header: say("admin.audit.when"), sortable: true, value: (r) => r.createdAt, cell: (r) => <time dateTime={r.createdAt} suppressHydrationWarning>{when.format(new Date(r.createdAt))}</time> },
      {
        id: "action",
        header: say("admin.audit.action"),
        card: "title",
        filter: "facet",
        options: ACTIONS.map((a) => ({ value: a, label: say(`admin.audit.actions.${a}`) })),
        value: (r) => r.action,
        cell: (r) => (ACTIONS as readonly string[]).includes(r.action) ? say(`admin.audit.actions.${r.action}`) : r.action,
      },
      { id: "actor", header: say("admin.audit.actor"), filter: "text", value: (r) => r.actor ?? "", cell: (r) => r.actor ?? say("admin.audit.system") },
      {
        id: "target",
        header: say("admin.audit.target"),
        value: (r) => r.targetId ?? "",
        cell: (r) => (r.targetId ? <Link className="font-mono text-xs text-fg-accent underline-offset-4 hover:underline" href={`/app/${locale}/admin/users/${r.targetId}`}>{r.targetId.slice(0, 8)}</Link> : "—"),
      },
      { id: "detail", header: say("admin.audit.detail"), value: (r) => (r.detail ? Object.values(r.detail).join(" · ") : ""), cell: (r) => (r.detail ? Object.values(r.detail).join(" · ") : "—") },
      { id: "ip", header: say("admin.audit.ip"), value: (r) => r.ip ?? "", cell: (r) => <span className="font-mono text-xs">{r.ip ?? "—"}</span> },
    ],
    [say, locale, when],
  );
  const labels = useMemo(() => tableLabels(say), [say]);
  return (
    <DataTable
      caption={say("admin.audit.caption")}
      rows={list.data?.rows ?? NONE}
      columns={columns}
      getRowId={(r) => r.id}
      rowLabel={(r) => r.action}
      manual={{ sorting: true, filtering: true, pagination: true }}
      rowCount={list.data?.total}
      defaultPageSize={25}
      pageSizeOptions={[10, 25, 50, 100]}
      defaultSort={{ column: "createdAt", direction: "descending" }}
      onStateChange={setQuery}
      loading={list.isPending}
      error={list.error ? say("errors.load") : undefined}
      labels={labels}
      toolbar={<DataTableFilters />}
    />
  );
}
