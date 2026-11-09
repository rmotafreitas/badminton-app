import type { DataField, DataRow, DataTable } from "@bb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Download, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { Page, PageHeader } from "@/shared/components/page-header";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/shared/ui/empty";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { dataPageQuery, dataTablesQuery, downloadCsv, type Filters, type ListParams } from "./api";
import { FieldValue, listedFields, type Refs, useFormatValue, useLabel, useRowTitle } from "./fields";
import { RecordSheet } from "./record-sheet";
import { RefPicker } from "./record-form";

/** The list's state lives in the URL (back/forward and shared links keep it). */
export interface DataSearch {
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  filters?: Filters;
}

const PAGE_SIZE = 25;

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function FilterControl({ field, value, refs, onChange }: { field: DataField; value: string | boolean | null | undefined; refs: Refs; onChange: (v: string | boolean | undefined) => void }) {
  const dict = useDictionary().ui;
  const label = useLabel();
  const name = label(field.label);
  if (field.type === "ref") {
    return (
      <RefPicker
        table={field.ref as string}
        value={(value as string | undefined) ?? null}
        current={field.ref && value ? refs[field.ref]?.[value as string] : undefined}
        label={name}
        allowNone={false}
        placeholder={`${name}: ${dict.data.all}`}
        className="h-10 w-full sm:w-48"
        onChange={(id) => onChange(id ?? undefined)}
      />
    );
  }
  const options: [string, string][] =
    field.type === "boolean"
      ? [
          ["true", dict.data.yes],
          ["false", dict.data.no],
        ]
      : field.type === "roles"
        ? (["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"] as const).map((r) => [r, dict.roles[r]])
        : (field.options ?? []).map((o) => [o, o]);
  const current = value === undefined || value === null ? "__all" : String(value);
  return (
    <Select value={current} onValueChange={(v) => onChange(v === "__all" ? undefined : field.type === "boolean" ? v === "true" : v)}>
      <SelectTrigger className="h-10 w-full sm:w-44" aria-label={name}>
        <span className="truncate">
          <span className="text-muted-foreground">{name}: </span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{dict.data.all}</SelectItem>
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Phone: one card per row, the title plus a couple of facts, a thumb-sized target. */
function RowCard({ table, row, refs, onOpen }: { table: DataTable; row: DataRow; refs: Refs; onOpen: () => void }) {
  const rowTitle = useRowTitle();
  const format = useFormatValue();
  const label = useLabel();
  const fields = listedFields(table);
  const image = fields.find((f) => f.type === "image" && f.key !== "banner");
  const title = rowTitle(table, row, refs);
  const facts = fields
    .filter((f) => f.type !== "image" && f.key !== table.titleField)
    .map((f) => [f, format(f, row.values[f.key], refs)] as const)
    .filter(([, text]) => text)
    .slice(0, 3);
  return (
    <button type="button" onClick={onOpen} className="tap-target flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
      {image && <FieldValue field={image} row={row} refs={refs} title={title} className="size-10" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {facts.map(([f, text]) => (f.type === "boolean" ? `${label(f.label)}: ${text}` : text)).join(" · ")}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function DataTablePage({ tableKey, search, onSearch }: { tableKey: string; search: DataSearch; onSearch: (next: DataSearch) => void }) {
  const dict = useDictionary().ui;
  const label = useLabel();
  const { api } = useAppContext();
  const tables = useQuery(dataTablesQuery(api));
  const [text, setText] = useState(search.q ?? "");
  const q = useDebounced(text.trim(), 300);
  const params: ListParams = { q: search.q, sort: search.sort, dir: search.dir, page: search.page ?? 1, pageSize: PAGE_SIZE, filters: search.filters };
  const page = useQuery(dataPageQuery(api, tableKey, params));
  const [open, setOpen] = useState<DataRow | "new" | null>(null);
  const [exporting, setExporting] = useState(false);

  // Typing updates the URL once it settles; a new search starts on page 1.
  useEffect(() => {
    if (q !== (search.q ?? "")) onSearch({ ...search, q: q || undefined, page: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // The table definition paints from the persisted list even before the first page arrives.
  const table = page.data?.table ?? tables.data?.find((t) => t.key === tableKey);
  const refs = (page.data?.refs ?? {}) as Refs;
  const fields = table ? listedFields(table) : [];
  // A club-scoped view only has one club: filtering by club means nothing there.
  const filterFields = table?.fields.filter((f) => f.filter && !(table.scope === "club" && f.ref === "clubs")) ?? [];
  const activeFilters = Object.keys(search.filters ?? {}).length;
  const sortField = search.sort ?? table?.defaultSort.field;
  const sortDir = search.sort ? (search.dir ?? "asc") : table?.defaultSort.dir;

  const setFilter = (key: string, value: string | boolean | undefined) => {
    const filters = { ...search.filters };
    if (value === undefined) delete filters[key];
    else filters[key] = value;
    onSearch({ ...search, filters: Object.keys(filters).length ? filters : undefined, page: undefined });
  };
  const sortBy = (f: DataField) => {
    if (!f.sort) return;
    const dir = sortField === f.key && sortDir === "asc" ? "desc" : "asc";
    onSearch({ ...search, sort: f.key, dir, page: undefined });
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadCsv(tableKey, params, label.lang);
    } catch {
      toast.error(dict.data.exportFailed);
    } finally {
      setExporting(false);
    }
  };

  const total = page.data?.total ?? 0;
  const current = page.data?.page ?? 1;
  const from = total ? (current - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(current * PAGE_SIZE, total);

  return (
    <Page wide>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link to="/data">
          <ArrowLeft /> {dict.data.title}
        </Link>
      </Button>
      <PageHeader
        title={table ? label(table.label) : <Skeleton className="h-8 w-40" />}
        description={
          table && (
            <span className="flex items-center gap-2">
              <Badge variant="secondary">{table.scope === "club" ? dict.data.clubScope : dict.data.allScope}</Badge>
              {page.data && fmt(dict.data.rows, { count: total })}
            </span>
          )
        }
        actions={
          table && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCsv} disabled={exporting || !total}>
                {exporting ? <Spinner /> : <Download />} {exporting ? dict.data.exporting : dict.data.export}
              </Button>
              {table.canCreate && (
                <Button onClick={() => setOpen("new")}>
                  <Plus /> {dict.data.new}
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={dict.data.search} className="h-10 pl-9" type="search" />
        </div>
        {filterFields.map((f) => (
          <FilterControl key={f.key} field={f} value={search.filters?.[f.key]} refs={refs} onChange={(v) => setFilter(f.key, v)} />
        ))}
        {activeFilters > 0 && (
          <Button variant="ghost" className="h-10" onClick={() => onSearch({ ...search, filters: undefined, page: undefined })}>
            <X /> {dict.data.clear}
          </Button>
        )}
      </div>

      <Card className={cn("gap-0 overflow-hidden py-0 transition-opacity", page.isPlaceholderData && "opacity-60")}>
        <CardContent className="px-0">
          {!page.data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : page.data.rows.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyTitle>{search.q || activeFilters ? dict.data.noMatch : dict.data.empty}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="divide-y md:hidden">
                {page.data.rows.map((row) => (
                  <RowCard key={row.id} table={page.data.table} row={row} refs={refs} onOpen={() => setOpen(row)} />
                ))}
              </div>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    {fields.map((f, i) => (
                      <TableHead key={f.key} className={cn(i === 0 && "pl-6", i === fields.length - 1 && "pr-6")}>
                        {f.sort ? (
                          <button type="button" onClick={() => sortBy(f)} className="inline-flex items-center gap-1 hover:text-foreground">
                            {f.type === "image" ? "" : label(f.label)}
                            {sortField === f.key && (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                          </button>
                        ) : f.type === "image" ? (
                          <span className="sr-only">{label(f.label)}</span>
                        ) : (
                          label(f.label)
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.data.rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setOpen(row)}>
                      {fields.map((f, i) => (
                        <TableCell key={f.key} className={cn("max-w-64 truncate", i === 0 && "pl-6", i === fields.length - 1 && "pr-6", f.type === "image" && "w-12")}>
                          <FieldValue field={f} row={row} refs={refs} title={String(row.values[page.data.table.titleField] ?? "")} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2">
          <span className="tabular text-sm text-muted-foreground">{fmt(dict.data.range, { from, to, total })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="size-11" aria-label={dict.data.previous} disabled={current <= 1} onClick={() => onSearch({ ...search, page: current - 1 })}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" className="size-11" aria-label={dict.data.next} disabled={to >= total} onClick={() => onSearch({ ...search, page: current + 1 })}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      {table && open && (
        <RecordSheet
          key={open === "new" ? "new" : open.id}
          table={table}
          row={open === "new" ? null : open}
          refs={refs}
          open
          onOpenChange={(o) => !o && setOpen(null)}
        />
      )}
    </Page>
  );
}
