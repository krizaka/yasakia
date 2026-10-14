import type { DataTableLabels } from "@krizaka/ui/data-table";

type Say = (key: string, vars?: Record<string, string | number>) => string;

/** The DataTable's words in the active language (all from `console.admin.table`). */
export function tableLabels(say: Say): DataTableLabels {
  const k = (key: string, vars?: Record<string, string | number>) => say(`admin.table.${key}`, vars);
  return {
    selectAll: k("selectAll"),
    selectRow: (name) => name,
    loading: k("loading"),
    empty: k("empty"),
    details: k("details"),
    expandRow: (name) => name,
    group: (value, count) => `${value} (${count})`,
    resize: (header) => header,
    results: (count) => k("results", { count }),
    filters: k("filters"),
    clearFilters: k("clear"),
    removeFilter: (label) => k("removeFilter", { label }),
    activeFilter: (header, value) => k("activeFilter", { header, value }),
    search: (header) => k("search", { header }),
    rangeFrom: (header) => header,
    rangeTo: (header) => header,
    columns: k("columns"),
    export: k("export"),
    pagination: {
      nav: k("paginationNav"),
      previous: k("previous"),
      next: k("next"),
      page: (page) => k("page", { page }),
      compact: (page, pages) => k("compact", { page, pages }),
      pageSize: k("pageSize"),
    },
  };
}

export const listParams = (query: { sort: { column: string; direction: string } | null; filters: Record<string, unknown>; page: number; pageSize: number }) => ({
  sort: query.sort && query.sort.column,
  dir: query.sort ? (query.sort.direction === "descending" ? "desc" : "asc") : undefined,
  page: query.page,
  size: query.pageSize,
});
