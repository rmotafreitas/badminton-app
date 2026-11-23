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

/** Pages received so far, kept by the caller so "Try again" only fetches what's missing. */
export type ReceivedPages = Map<number, readonly (readonly ExportCell[])[]>;

export class ExportAborted extends Error {
  constructor() {
    super("Export cancelled.");
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
 */
export async function collectRows({
  fetchPage,
  pageSize,
  maxRows,
  signal,
  received = new Map(),
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
  const count = () => [...received.values()].reduce((n, rows) => n + rows.length, 0);
  const report = () => onProgress?.({ done: Math.min(count(), total), total });

  const first = await withRetries(() => fetchPage(1, signal), signal, retries);
  received.set(1, first.rows);
  total = Math.min(first.total, maxRows);
  report();

  const pages = Math.ceil(total / pageSize);
  const missing = Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => i + 2).filter((p) => !received.has(p));
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      if (signal.aborted) throw new ExportAborted();
      const page = missing[next++] as number;
      const result = await withRetries(() => fetchPage(page, signal), signal, retries);
      received.set(page, result.rows);
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));

  const rows: (readonly ExportCell[])[] = [];
  for (let p = 1; p <= Math.max(pages, 1); p++) rows.push(...(received.get(p) ?? []));
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
