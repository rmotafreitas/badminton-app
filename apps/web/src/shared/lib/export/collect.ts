import type { ExportCell } from "./sheet";

export interface ExportPage {
  readonly rows: readonly (readonly ExportCell[])[];
  /** Every matching row, not just this page's. */
  readonly total: number;
}

/** Fetches one page (1-based) of an export. */
export type FetchExportPage = (page: number, signal: AbortSignal) => Promise<ExportPage>;

export interface CollectProgress {
  readonly done: number;
  readonly total: number;
}

/** Pages received so far and the total they were fetched under, kept by the caller so "Try again" only fetches what's missing. */
export interface ReceivedPages {
  total: number | null;
  readonly pages: Map<number, readonly (readonly ExportCell[])[]>;
}

export const noPages = (): ReceivedPages => ({ total: null, pages: new Map() });

export class ExportAborted extends Error {
  constructor() {
    super("Export cancelled.");
  }
}

/** Rows were added or removed while the pages came in: pages no longer line up, so the export starts over. */
export class ExportChanged extends Error {
  constructor() {
    super("The data changed during the export.");
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new ExportAborted());
    });
  });

async function withRetries<T>(run: () => Promise<T>, signal: AbortSignal, retries: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (signal.aborted) throw new ExportAborted();
      if (attempt >= retries) throw error;
      await sleep(400 * 2 ** attempt, signal);
    }
  }
}

/**
 * Every row of an export, in order: the first page says how many there are, then the rest come `concurrency` at a
 * time. Each page is retried `retries` times; a page that still fails rejects, leaving what arrived in `received`.
 * Pages are offsets, so a page reporting a different total means rows moved between pages: `received` is cleared and
 * it rejects with `ExportChanged` (trying again starts from scratch) rather than writing a file with gaps or doubles.
 */
export async function collectRows({
  fetchPage,
  pageSize,
  maxRows,
  signal,
  received = noPages(),
  onProgress,
  concurrency = 4,
  retries = 2,
}: {
  fetchPage: FetchExportPage;
  pageSize: number;
  maxRows: number;
  signal: AbortSignal;
  received?: ReceivedPages;
  onProgress?: (progress: CollectProgress) => void;
  concurrency?: number;
  retries?: number;
}): Promise<{ rows: (readonly ExportCell[])[]; total: number; capped: boolean }> {
  let total = 0;
  const { pages: got } = received;
  const count = () => [...got.values()].reduce((n, rows) => n + rows.length, 0);
  const report = () => onProgress?.({ done: Math.min(count(), total), total });

  const changed = () => {
    got.clear();
    received.total = null;
    return new ExportChanged();
  };
  const first = await withRetries(() => fetchPage(1, signal), signal, retries);
  // Resuming: pages kept from before only line up if the total is still the same.
  if (received.total !== null && received.total !== first.total) got.clear();
  received.total = first.total;
  got.set(1, first.rows);
  total = Math.min(first.total, maxRows);
  report();

  const pages = Math.ceil(total / pageSize);
  const missing = Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => i + 2).filter((p) => !got.has(p));
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      if (signal.aborted) throw new ExportAborted();
      const page = missing[next++] as number;
      const result = await withRetries(() => fetchPage(page, signal), signal, retries);
      if (result.total !== first.total) throw changed();
      got.set(page, result.rows);
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));

  const rows: (readonly ExportCell[])[] = [];
  for (let p = 1; p <= Math.max(pages, 1); p++) rows.push(...(got.get(p) ?? []));
  return { rows: rows.slice(0, total), total: first.total, capped: first.total > maxRows };
}

/** Hands a file to the browser as a download. */
export function saveFile(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
