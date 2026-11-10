/**
 * /analysis — every session: on this device (with live status) and the ones recorded on other devices (from the
 * server). One tap to record or import.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Cloud, Smartphone, Upload, Video, WifiOff } from "lucide-react";
import { useMemo, useRef } from "react";
import { useAppContext } from "@/app/context";
import { rallySessionsQuery, rallyUsageQuery } from "@/features/rally/api";
import type { RallySession } from "@/features/rally/model";
import type { LocalSession } from "@/features/rally/sessions/manager";
import { Page, PageHeader } from "@/shared/components/page-header";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Progress } from "@/shared/ui/progress";
import { GpuNotice } from "./GpuNotice";
import { ModelStatus } from "./ModelStatus";
import { formatBytes, formatDuration, useLocalSessions, useOnline, useSessionManager } from "./hooks";
import { AnalysisBadge, Pill, UploadBadge } from "./StatusBadges";

const when = (iso: string | Date, locale: string) => new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

function SummaryLine({ s }: { s: LocalSession["summary"] | RallySession["summary"] }) {
  const t = useDictionary().rally.session;
  if (!s) return null;
  const top = Math.max(0, ...s.stats.players.map((p) => p.maxSpeedKmh ?? 0));
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        {s.stats.rallies} {t.rallies.toLowerCase()}
      </span>
      <span>
        {s.stats.shots} {t.shots.toLowerCase()}
      </span>
      {top > 0 && (
        <span>
          {t.maxSpeed}: ~{top} km/h
        </span>
      )}
    </div>
  );
}

function SessionThumb({ cloud }: { cloud?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl",
        cloud ? "bg-sky-500/10 text-sky-600 dark:text-sky-300" : "bg-primary/10 text-primary",
      )}
    >
      {cloud ? <Cloud className="size-5" /> : <Video className="size-5" />}
    </span>
  );
}

export default function SessionsPage() {
  const t = useDictionary().rally;
  const { lang: locale } = useLanguage();
  const navigate = useNavigate();
  const { api } = useAppContext();
  const manager = useSessionManager();
  const local = useLocalSessions();
  const online = useOnline();
  const fileRef = useRef<HTMLInputElement>(null);
  const remote = useQuery({ ...rallySessionsQuery(api), enabled: online });
  const usage = useQuery({ ...rallyUsageQuery(api), enabled: online });

  // Server sessions not on this device (recorded/analysed elsewhere).
  const others = useMemo(() => {
    const localServerIds = new Set(local.map((s) => s.serverId).filter(Boolean));
    const localClientIds = new Set(local.map((s) => s.clientId));
    return (remote.data ?? []).filter((r) => !localServerIds.has(r.id) && !(r.clientId && localClientIds.has(r.clientId)));
  }, [remote.data, local]);

  const running = local.find((s) => s.analysis.state === "running");

  const onImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const id = await manager.addVideo(file, {
      source: "import",
      title: file.name.replace(/\.[^.]+$/, ""),
      recordedAt: new Date(file.lastModified || Date.now()),
    });
    await navigate({ to: "/analysis/$key", params: { key: id } });
  };

  return (
    <Page>
      <PageHeader
        title={t.title}
        description={t.subtitle}
        actions={
          <>
            <Button asChild>
              <Link to="/analysis/record">
                <span className="size-2.5 rounded-full bg-red-500 ring-2 ring-red-500/30" /> {t.record}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} title={t.importHint}>
              <Upload /> {t.import}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                void onImport(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        }
      />

      {!online && (
        <Alert>
          <WifiOff />
          <AlertDescription>{t.offline}</AlertDescription>
        </Alert>
      )}

      <ModelStatus refreshKey={running?.clientId} />

      {running && (
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium">
                {t.analysing}: {running.title ?? t.session.untitled} · {t.phases[(running.analysis.phase as keyof typeof t.phases) ?? "scan"] ?? ""}
              </div>
              <Progress value={Math.round((running.analysis.progress ?? 0) * 100)} />
              <p className="text-xs text-muted-foreground">{t.keepOpen}</p>
              <GpuNotice />
            </div>
            <Button variant="outline" onClick={() => manager.cancel(running.clientId)}>
              {t.cancel}
            </Button>
          </CardContent>
        </Card>
      )}

      {local.length === 0 && others.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Video />
            </EmptyMedia>
            <EmptyTitle>{t.title}</EmptyTitle>
            <EmptyDescription>{t.empty}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button asChild>
              <Link to="/analysis/record">{t.record}</Link>
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload /> {t.import}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {local.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="size-4 text-muted-foreground" /> {t.onThisDevice}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y px-2">
            {local.map((s) => (
              <Link
                key={s.clientId}
                to="/analysis/$key"
                params={{ key: s.clientId }}
                className="group flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-accent/60"
              >
                <SessionThumb />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {s.title ?? t.session.untitled} <span className="font-normal text-muted-foreground">· {when(s.recordedAt, locale)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <AnalysisBadge s={s} />
                    <UploadBadge s={s} />
                    <Pill tone="muted">{formatDuration(s.durationS)}</Pill>
                    {s.format && <Pill tone="muted">{t.formats[s.format]}</Pill>}
                  </div>
                  <SummaryLine s={s.summary} />
                </div>
                {(s.analysis.state === "waiting" || s.analysis.state === "failed") && (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      manager.queueAnalysis(s.clientId);
                    }}
                  >
                    {s.analysis.state === "failed" ? t.retry : t.analyseNow}
                  </Button>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {others.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cloud className="size-4 text-muted-foreground" /> {t.otherDevice}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y px-2">
            {others.map((r) => (
              <Link key={r.id} to="/analysis/s/$serverId" params={{ serverId: r.id }} className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-accent/60">
                <SessionThumb cloud />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {r.title ?? t.session.untitled} <span className="font-normal text-muted-foreground">· {when(r.recordedAt, locale)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Pill tone={r.status === "analysed" ? "ok" : r.status === "failed" ? "err" : "muted"}>
                      {r.status === "analysed" ? t.analysed : r.status === "analysing" ? t.analysing : t.queued}
                    </Pill>
                    <Pill tone="muted">{formatDuration(r.durationS)}</Pill>
                    {r.format && <Pill tone="muted">{t.formats[r.format]}</Pill>}
                  </div>
                  <SummaryLine s={r.summary} />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {usage.data && (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>{t.storage}</span>
            <span className="tabular">
              {formatBytes(usage.data.usedBytes)} / {formatBytes(usage.data.limitBytes)}
            </span>
          </div>
          <Progress
            value={Math.min(100, (usage.data.usedBytes / usage.data.limitBytes) * 100)}
            className={cn("h-1.5", usage.data.usedBytes > usage.data.limitBytes && "[&>div]:bg-destructive")}
          />
          <p>{t.storageNote}</p>
        </div>
      )}
    </Page>
  );
}
