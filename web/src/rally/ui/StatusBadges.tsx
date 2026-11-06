import { useDictionary } from "@/i18n";
import type { LocalSession } from "../sessions/manager";

function Pill({ tone, children }: { tone: "ok" | "busy" | "warn" | "muted" | "err"; children: React.ReactNode }) {
  const tones = {
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    busy: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    muted: "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300",
    err: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

const pct = (p?: number) => (p === undefined ? "" : ` ${Math.round(p * 100)}%`);

export function AnalysisBadge({ s }: { s: Pick<LocalSession, "analysis"> }) {
  const t = useDictionary().rally;
  const a = s.analysis;
  switch (a.state) {
    case "running":
      return (
        <Pill tone="busy">
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          {t.analysing}
          {pct(a.progress)}
        </Pill>
      );
    case "queued":
      return <Pill tone="muted">{t.queued}</Pill>;
    case "waiting":
      return <Pill tone="muted">{t.waiting}</Pill>;
    case "needs-court":
      return (
        <Pill tone="warn">
          <i aria-hidden className="mdi mdi-vector-square" />
          {t.needsCourt}
        </Pill>
      );
    case "done":
      return <Pill tone="ok">{t.analysed}</Pill>;
    case "failed":
      return <Pill tone="err">{t.failed}</Pill>;
  }
}

export function UploadBadge({ s }: { s: Pick<LocalSession, "upload"> }) {
  const t = useDictionary().rally.upload;
  const u = s.upload;
  const tone = u.state === "done" ? "ok" : u.state === "failed" ? "err" : u.state === "unavailable" ? "warn" : "muted";
  return (
    <Pill tone={u.state === "uploading" || u.state === "transcoding" ? "busy" : tone}>
      <i className={`mdi ${u.state === "done" ? "mdi-cloud-check" : "mdi-cloud-upload"}`} />
      {t[u.state]}
      {u.state === "uploading" || u.state === "transcoding" ? pct(u.progress) : ""}
    </Pill>
  );
}

export { Pill };
