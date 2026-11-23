import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { type CollectProgress, collectRows, ExportAborted, ExportChanged, type FetchExportPage, noPages, type ReceivedPages, saveFile } from "@/shared/lib/export/collect";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Progress } from "@/shared/ui/progress";
import { Spinner } from "@/shared/ui/spinner";

type Format = "xlsx" | "csv";

interface Run {
  readonly format: Format;
  readonly received: ReceivedPages;
  controller: AbortController;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Export as Excel or CSV. Rows come page by page (`fetchPage`) and the file is built here, in the browser. One page
 * downloads at once; more than that shows a progress sheet with Cancel, and a failed page offers "Try again", which
 * fetches only the pages still missing.
 */
export function ExportButton({
  name,
  title,
  headers,
  fetchPage,
  pageSize,
  maxRows,
  lang,
  disabled,
}: {
  /** File base name (no extension). */
  name: string;
  /** What is being exported, for the progress sheet. */
  title: string;
  headers: readonly string[];
  fetchPage: FetchExportPage;
  pageSize: number;
  maxRows: number;
  lang: "en" | "pt";
  disabled?: boolean;
}) {
  const dict = useDictionary().ui;
  const run = useRef<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [progress, setProgress] = useState<CollectProgress>({ done: 0, total: 0 });
  const [failed, setFailed] = useState<"failed" | "changed" | null>(null);

  const go = async (current: Run) => {
    setBusy(true);
    setFailed(null);
    try {
      const result = await collectRows({
        fetchPage,
        pageSize,
        maxRows,
        signal: current.controller.signal,
        received: current.received,
        onProgress: (p) => {
          setProgress(p);
          if (p.total > pageSize) setSheet(true);
        },
      });
      const { toCsv, toXlsx, XLSX_TYPE } = await import("@/shared/lib/export/sheet");
      const table = { name: title, headers, rows: result.rows };
      if (current.format === "xlsx") saveFile(toXlsx(table) as Uint8Array<ArrayBuffer>, `${name}-${today()}.xlsx`, XLSX_TYPE);
      else saveFile(toCsv(table, lang), `${name}-${today()}.csv`, "text/csv;charset=utf-8");
      if (result.capped) toast.info(fmt(dict.data.exportCapped, { max: maxRows.toLocaleString(lang) }));
      run.current = null;
      setSheet(false);
    } catch (error) {
      if (error instanceof ExportAborted || current.controller.signal.aborted) return;
      setFailed(error instanceof ExportChanged ? "changed" : "failed");
      setSheet(true);
    } finally {
      setBusy(false);
    }
  };

  const start = (format: Format) => {
    run.current?.controller.abort();
    const current: Run = { format, received: noPages(), controller: new AbortController() };
    run.current = current;
    setProgress({ done: 0, total: 0 });
    void go(current);
  };

  const retry = () => {
    const current = run.current;
    if (!current) return;
    current.controller = new AbortController();
    void go(current);
  };

  const cancel = () => {
    run.current?.controller.abort();
    run.current = null;
    setBusy(false);
    setFailed(null);
    setSheet(false);
  };

  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={disabled || busy}>
            {busy ? <Spinner /> : <Download />} {busy ? dict.data.exporting : dict.data.export}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="min-h-11" onSelect={() => start("xlsx")}>
            <FileSpreadsheet /> {dict.data.exportExcel}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={() => start("csv")}>
            <FileText /> {dict.data.exportCsv}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResponsiveSheet
        open={sheet}
        onOpenChange={(open) => !open && cancel()}
        title={fmt(dict.data.exportTitle, { table: title })}
        footer={
          <div className="flex w-full gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1 text-base" onClick={cancel}>
              {dict.common.cancel}
            </Button>
            {failed && (
              <Button type="button" className="h-12 flex-1 text-base" onClick={retry}>
                {dict.data.exportRetry}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-3 py-2" role="status" aria-live="polite">
          {/* Before the first page there is nothing to count: only the error, if any. */}
          {progress.total > 0 && (
            <>
              <Progress value={percent} aria-label={dict.data.exporting} />
              <p className="tabular text-sm text-muted-foreground">
                {fmt(dict.data.exportProgress, { done: progress.done.toLocaleString(lang), total: progress.total.toLocaleString(lang) })}
              </p>
            </>
          )}
          {failed && <p className="text-sm text-destructive">{failed === "changed" ? dict.data.exportChanged : dict.data.exportFailed}</p>}
        </div>
      </ResponsiveSheet>
    </>
  );
}
