"use client";

import { defineKeys, keepPreviousData, krizakaFetch, useMutation, useQuery, useQueryClient } from "@krizaka/query";
import { Alert } from "@krizaka/ui/alert";
import { Badge } from "@krizaka/ui/badge";
import { Button } from "@krizaka/ui/button";
import { DataTable, type DataTableColumn, DataTableFilters, type DataTableQuery } from "@krizaka/ui/data-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { errorKey } from "@/lib/client";
import { useSay } from "@/lib/i18n-client";

import { tableLabels } from "./table";

interface ReportRow {
  id: string;
  reporterId: string | null;
  reportedId: string | null;
  reason: string;
  status: "OPEN" | "REVIEWED" | "ACTIONED" | "DISMISSED";
  introId: string | null;
  photoId: string | null;
  urgent: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

const STATUSES = ["OPEN", "REVIEWED", "ACTIONED", "DISMISSED"] as const;
const keys = defineKeys("admin-reports", { list: (query: DataTableQuery) => [query], details: (id: string) => [id] });
const NONE: ReportRow[] = [];
const TONE = { OPEN: "warning", REVIEWED: "neutral", ACTIONED: "success", DISMISSED: "neutral" } as const;

/** What was written in one report: fetched when the row opens, never in the list. */
function Details({ row }: { row: ReportRow }) {
  const { say } = useSay();
  const client = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const details = useQuery({ queryKey: keys.details(row.id), queryFn: ({ signal }) => krizakaFetch(`/api/admin/report-queue/${row.id}`, { signal }) as Promise<{ details: string | null }> });
  const move = useMutation({
    mutationFn: (status: string) => krizakaFetch(`/api/admin/report-queue/${row.id}`, { method: "PATCH", json: { status } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-reports"] }),
    onError: (error) => setProblem(say(`errors.${errorKey(error)}`)),
  });
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <p className="font-medium text-fg">{say("admin.reports.details")}</p>
      <p className="whitespace-pre-wrap text-fg-secondary">{details.isPending ? say("admin.table.loading") : (details.data?.details ?? say("admin.reports.noDetails"))}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-muted">{say("admin.reports.setStatus")}</span>
        {STATUSES.filter((s) => s !== row.status).map((s) => (
          <Button key={s} size="sm" variant="secondary" shape="cut" loading={move.isPending && move.variables === s} onClick={() => move.mutate(s)}>
            {say(`admin.reports.statuses.${s}`)}
          </Button>
        ))}
      </div>
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
    </div>
  );
}

/** The moderation queue, on the server: status filter, order and pages go to `/api/admin/report-queue`; a row opens to its words and its decisions. */
export function ReportsTable() {
  const { say, locale } = useSay();
  const [query, setQuery] = useState<DataTableQuery>({ sort: { column: "createdAt", direction: "descending" }, filters: { status: ["OPEN"] }, page: 1, pageSize: 25 });
  const list = useQuery({
    queryKey: keys.list(query),
    queryFn: ({ signal }) =>
      krizakaFetch("/api/admin/report-queue", { signal, query: { page: query.page, size: query.pageSize, dir: query.sort?.direction === "ascending" ? "asc" : "desc", status: query.filters.status as string[] | undefined } }) as Promise<{ rows: ReportRow[]; total: number }>,
    placeholderData: keepPreviousData,
    meta: { list: true },
  });
  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const who = (id: string | null) =>
    id ? (
      <Link className="font-mono text-xs text-fg-accent underline-offset-4 hover:underline" href={`/${locale}/admin/users/${id}`}>
        {id.slice(0, 8)}
      </Link>
    ) : (
      say("admin.reports.deletedAccount")
    );
  const columns = useMemo<DataTableColumn<ReportRow>[]>(
    () => [
      {
        id: "reason",
        header: say("admin.reports.reason"),
        card: "title",
        value: (r) => r.reason,
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            {say(`admin.reports.reasons.${r.reason}`)}
            {r.urgent && r.status === "OPEN" ? (
              <Badge tone="danger" size="sm">
                {say("admin.reports.urgent")}
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: "status",
        header: say("admin.reports.status"),
        filter: "facet",
        options: STATUSES.map((s) => ({ value: s, label: say(`admin.reports.statuses.${s}`) })),
        value: (r) => r.status,
        cell: (r) => (
          <Badge tone={TONE[r.status]} dot size="sm">
            {say(`admin.reports.statuses.${r.status}`)}
          </Badge>
        ),
      },
      { id: "reported", header: say("admin.reports.reported"), value: (r) => r.reportedId ?? "", cell: (r) => who(r.reportedId) },
      { id: "reporter", header: say("admin.reports.reporter"), value: (r) => r.reporterId ?? "", cell: (r) => who(r.reporterId) },
      { id: "where", header: say("admin.reports.where"), value: (r) => (r.introId ? "intro" : r.photoId ? "photo" : ""), cell: (r) => (r.introId ? say("admin.reports.inIntro") : r.photoId ? say("admin.reports.inPhoto") : say("admin.reports.nowhere")) },
      { id: "createdAt", header: say("admin.reports.filed"), sortable: true, value: (r) => r.createdAt, cell: (r) => <time dateTime={r.createdAt} suppressHydrationWarning>{when.format(new Date(r.createdAt))}</time> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `who` only reads `say` and `locale`
    [say, locale, when],
  );
  const labels = useMemo(() => tableLabels(say), [say]);
  return (
    <DataTable
      caption={say("admin.reports.caption")}
      rows={list.data?.rows ?? NONE}
      columns={columns}
      getRowId={(r) => r.id}
      rowLabel={(r) => say(`admin.reports.reasons.${r.reason}`)}
      renderDetail={(r) => <Details row={r} />}
      manual={{ sorting: true, filtering: true, pagination: true }}
      rowCount={list.data?.total}
      defaultPageSize={25}
      pageSizeOptions={[10, 25, 50, 100]}
      defaultSort={{ column: "createdAt", direction: "descending" }}
      defaultFilters={{ status: ["OPEN"] }}
      onStateChange={setQuery}
      loading={list.isPending}
      error={list.error ? say("errors.load") : undefined}
      labels={labels}
      toolbar={<DataTableFilters />}
    />
  );
}
