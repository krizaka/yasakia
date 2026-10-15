"use client";

import { defineKeys, keepPreviousData, krizakaFetch, useQuery } from "@krizaka/query";
import { Badge } from "@krizaka/ui/badge";
import { DataTable, type DataTableColumn, DataTableFilters, type DataTableQuery } from "@krizaka/ui/data-table";
import { useMemo, useState } from "react";

import { useSay } from "@/lib/i18n-client";

import { tableLabels } from "./table";

interface IntroRow {
  id: string;
  state: "OPEN" | "CONTINUED" | "FADED" | "CLOSED";
  openedAt: string;
  expiresAt: string;
  closedReason: string | null;
  frozen: boolean;
  messages: number;
}

const STATES = ["OPEN", "CONTINUED", "FADED", "CLOSED"] as const;
const keys = defineKeys("admin-intros", { list: (query: DataTableQuery) => [query] });
const NONE: IntroRow[] = [];
const TONE = { OPEN: "accent", CONTINUED: "success", FADED: "neutral", CLOSED: "warning" } as const;

/** The introductions overview, on the server: state filter, order and pages go to `/api/admin/intros`. */
export function IntrosTable() {
  const { say, locale } = useSay();
  const [query, setQuery] = useState<DataTableQuery>({ sort: { column: "openedAt", direction: "descending" }, filters: {}, page: 1, pageSize: 25 });
  const list = useQuery({
    queryKey: keys.list(query),
    queryFn: ({ signal }) =>
      krizakaFetch("/api/admin/intros", { signal, query: { page: query.page, size: query.pageSize, dir: query.sort?.direction === "ascending" ? "asc" : "desc", state: query.filters.state as string[] | undefined } }) as Promise<{ rows: IntroRow[]; total: number }>,
    placeholderData: keepPreviousData,
    meta: { list: true },
  });
  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const columns = useMemo<DataTableColumn<IntroRow>[]>(
    () => [
      { id: "id", header: say("admin.intros.id"), card: "title", value: (r) => r.id, cell: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> },
      {
        id: "state",
        header: say("admin.intros.state"),
        filter: "facet",
        options: STATES.map((s) => ({ value: s, label: say(`admin.intros.states.${s}`) })),
        value: (r) => r.state,
        cell: (r) => (
          <Badge tone={TONE[r.state]} dot size="sm">
            {say(`admin.intros.states.${r.state}`)}
          </Badge>
        ),
      },
      { id: "openedAt", header: say("admin.intros.opened"), sortable: true, value: (r) => r.openedAt, cell: (r) => <time dateTime={r.openedAt} suppressHydrationWarning>{when.format(new Date(r.openedAt))}</time> },
      { id: "expiresAt", header: say("admin.intros.expires"), value: (r) => r.expiresAt, cell: (r) => <time dateTime={r.expiresAt} suppressHydrationWarning>{when.format(new Date(r.expiresAt))}</time> },
      { id: "messages", header: say("admin.intros.messages"), align: "end", value: (r) => r.messages },
      { id: "closedReason", header: say("admin.intros.closedReason"), value: (r) => r.closedReason ?? "", cell: (r) => r.closedReason ?? "—" },
      { id: "frozen", header: say("admin.intros.frozen"), value: (r) => (r.frozen ? "1" : ""), cell: (r) => (r.frozen ? say("admin.intros.yes") : say("admin.intros.no")) },
    ],
    [say, when],
  );
  const labels = useMemo(() => tableLabels(say), [say]);
  return (
    <DataTable
      caption={say("admin.intros.caption")}
      rows={list.data?.rows ?? NONE}
      columns={columns}
      getRowId={(r) => r.id}
      rowLabel={(r) => r.id.slice(0, 8)}
      manual={{ sorting: true, filtering: true, pagination: true }}
      rowCount={list.data?.total}
      defaultPageSize={25}
      pageSizeOptions={[10, 25, 50, 100]}
      defaultSort={{ column: "openedAt", direction: "descending" }}
      onStateChange={setQuery}
      loading={list.isPending}
      error={list.error ? say("errors.load") : undefined}
      labels={labels}
      toolbar={<DataTableFilters />}
    />
  );
}
