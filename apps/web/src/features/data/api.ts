import type { DataOption, DataPage, DataRecord, DataRelated, DataTable } from "@bb/contracts";
import { keepPreviousData, type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Api, sendForm, setImageField, unwrap } from "@/app/api";
import { staleTime } from "@/app/query-client";

export type Filters = Record<string, string | boolean | null>;

export interface ListParams {
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  filters?: Filters;
  view?: string;
  /** `table:id`: only the rows related to that row. */
  of?: string;
}

export const dataKeys = {
  all: ["data"] as const,
  tables: () => ["data", "tables"] as const,
  table: (table: string) => ["data", "table", table] as const,
  page: (table: string, params: ListParams) => ["data", "table", table, "page", params] as const,
  record: (table: string, id: string) => ["data", "table", table, "record", id] as const,
  related: (table: string, id: string) => ["data", "table", table, "record", id, "related"] as const,
  options: (table: string, q: string) => ["data", "options", table, q] as const,
};

const query = (params: ListParams) => ({
  q: params.q || undefined,
  sort: params.sort,
  dir: params.dir,
  page: params.page,
  pageSize: params.pageSize,
  filters: params.filters && Object.keys(params.filters).length ? JSON.stringify(params.filters) : undefined,
  view: params.view,
  of: params.of,
});

/** The tables this user may open (empty for players). Persisted, so the Data menu paints at once. */
export const dataTablesQuery = (api: Api) =>
  queryOptions({
    queryKey: dataKeys.tables(),
    queryFn: async () => unwrap(await api.data.get()) as DataTable[],
    staleTime: staleTime.own,
    meta: { persist: true },
  });

/** One page of rows. The previous page stays on screen while the next one loads (no flash on sort/search). */
export const dataPageQuery = (api: Api, table: string, params: ListParams) =>
  queryOptions({
    queryKey: dataKeys.page(table, params),
    queryFn: async () => unwrap(await api.data({ table }).get({ query: query(params) })) as DataPage,
    placeholderData: keepPreviousData,
  });

export const dataRecordQuery = (api: Api, table: string, id: string) =>
  queryOptions({
    queryKey: dataKeys.record(table, id),
    queryFn: async () => unwrap(await api.data({ table })({ id }).get()) as DataRecord,
  });

/** How many rows of each related table point at this row. */
export const dataRelatedQuery = (api: Api, table: string, id: string) =>
  queryOptions({
    queryKey: dataKeys.related(table, id),
    queryFn: async () => unwrap(await api.data({ table })({ id }).related.get()) as DataRelated[],
  });

export const dataOptionsQuery = (api: Api, table: string, q: string) =>
  queryOptions({
    queryKey: dataKeys.options(table, q),
    queryFn: async () => unwrap(await api.data({ table }).options.get({ query: { q: q || undefined } })) as DataOption[],
    placeholderData: keepPreviousData,
  });

/** `values`: fields to set (null clears). `images`: a File to set, null to remove, absent to keep. */
export interface RecordWrite {
  values: Record<string, unknown>;
  images?: Record<string, File | null | undefined>;
}

const toForm = ({ values, images = {} }: RecordWrite) => {
  const form = new FormData();
  form.set("values", JSON.stringify(values));
  for (const [key, file] of Object.entries(images)) setImageField(form, key, file);
  return form;
};

export const createRecord = (table: string, write: RecordWrite) =>
  sendForm<DataRecord>("POST", `/api/data/${encodeURIComponent(table)}`, toForm(write));

export const updateRecord = (table: string, id: string, write: RecordWrite) =>
  sendForm<DataRecord>("PATCH", `/api/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, toForm(write));

export const deleteRecord = async (api: Api, table: string, id: string) => unwrap(await api.data({ table })({ id }).delete());

/** One big page of an export (same filters, view and scope as the list). */
export async function fetchExportPage(api: Api, table: string, params: ListParams, page: number, pageSize: number, signal: AbortSignal) {
  return unwrap(await api.data({ table }).export.get({ query: { ...query(params), page, pageSize }, fetch: { signal } })) as DataPage;
}

/**
 * A Data write can change what other screens show (clubs, rosters, games, ratings, the session user), so they are
 * all marked stale. Not awaited: the sheet closes as soon as the server answered.
 */
export function invalidateAfterDataWrite(queryClient: QueryClient, table: string) {
  void queryClient.invalidateQueries({ queryKey: dataKeys.table(table) });
  void queryClient.invalidateQueries({ queryKey: ["data", "options"] });
  const related: Record<string, readonly (readonly string[])[]> = {
    clubs: [["clubs"], ["session"], ["users"]],
    users: [["clubs"], ["users"], ["session"], ["profiles"]],
    games: [["games"], ["clubs"], ["profiles"], ["session"]],
  };
  for (const key of related[table] ?? []) void queryClient.invalidateQueries({ queryKey: key });
}
