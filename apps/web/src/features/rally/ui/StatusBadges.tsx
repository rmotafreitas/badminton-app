import { CloudCheck, CloudUpload, Frame } from "lucide-react";
import type { ReactNode } from "react";
import type { LocalSession } from "@/features/rally/sessions/manager";
import { useDictionary } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

const TONES = {
  ok: "bg-primary/12 text-primary",
  busy: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  muted: "bg-muted text-muted-foreground",
  err: "bg-destructive/12 text-destructive",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3.5", TONES[tone])}>
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
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
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
          <Frame aria-hidden />
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
  const busy = u.state === "uploading" || u.state === "transcoding";
  const tone = busy ? "busy" : u.state === "done" ? "ok" : u.state === "failed" ? "err" : u.state === "unavailable" ? "warn" : "muted";
  return (
    <Pill tone={tone}>
      {u.state === "done" ? <CloudCheck aria-hidden /> : <CloudUpload aria-hidden />}
      {t[u.state]}
      {busy ? pct(u.progress) : ""}
    </Pill>
  );
}
