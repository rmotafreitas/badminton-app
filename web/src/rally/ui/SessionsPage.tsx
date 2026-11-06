/**
 * /analysis — every session: on this device (with live status) and the ones
 * recorded on other devices (from the server). One tap to record or import.
 */
import { useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDictionary, useLanguage } from "@/i18n";
import { useRallyRepo } from "@/di/container";
import { useQuery } from "@/hooks/useQuery";
import type { RallySession } from "@/core/domain/rally";
import { AnalysisBadge, Pill, UploadBadge } from "./StatusBadges";
import { formatBytes, formatDuration, useLocalSessions, useOnline, useSessionManager } from "./hooks";
import type { LocalSession } from "../sessions/manager";

function when(iso: string | Date, locale: string) {
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function SummaryLine({ s }: { s: LocalSession["summary"] | RallySession["summary"] }) {
  const t = useDictionary().rally.session;
  if (!s) return null;
  const top = Math.max(0, ...s.stats.players.map((p) => p.maxSpeedKmh ?? 0));
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
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

export default function SessionsPage() {
  const dict = useDictionary();
  const t = dict.rally;
  const { lang: locale } = useLanguage();
  const navigate = useNavigate();
  const manager = useSessionManager();
  const local = useLocalSessions();
  const online = useOnline();
  const repo = useRallyRepo();
  const fileRef = useRef<HTMLInputElement>(null);

  const remote = useQuery(["rally-sessions"], () => repo.list(), { enabled: online });
  const usage = useQuery(["rally-usage"], () => repo.usage(), { enabled: online });

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
    navigate(`/analysis/${id}`);
  };

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="title">{t.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/analysis/record" className="button green">
              <span className="icon">
                <i className="mdi mdi-record-circle" />
              </span>
              <span>{t.record}</span>
            </Link>
            <button className="button blue" onClick={() => fileRef.current?.click()} title={t.importHint}>
              <span className="icon">
                <i className="mdi mdi-upload" />
              </span>
              <span>{t.import}</span>
            </button>
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
          </div>
        </div>
      </section>

      <section className="section main-section space-y-4">
        {!online && (
          <div className="notification yellow">
            <i className="mdi mdi-wifi-off mr-2" />
            {t.offline}
          </div>
        )}

        {running && (
          <div className="card">
            <div className="card-content flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {t.analysing}: {running.title ?? t.session.untitled} ·{" "}
                  {t.phases[(running.analysis.phase as keyof typeof t.phases) ?? "scan"] ?? ""}
                </div>
                <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded mt-2">
                  <div
                    className="h-2 rounded bg-emerald-500 transition-all"
                    style={{ width: `${Math.round((running.analysis.progress ?? 0) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">{t.keepOpen}</p>
              </div>
              <button className="button light" onClick={() => manager.cancel(running.clientId)}>
                {t.cancel}
              </button>
            </div>
          </div>
        )}

        {local.length === 0 && others.length === 0 && (
          <div className="card">
            <div className="card-content text-center py-10 text-gray-500">
              <i className="mdi mdi-video-outline text-4xl block mb-2" />
              {t.empty}
            </div>
          </div>
        )}

        {local.length > 0 && (
          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon">
                  <i className="mdi mdi-cellphone" />
                </span>
                {t.onThisDevice}
              </p>
            </header>
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {local.map((s) => (
                <li key={s.clientId}>
                  <Link
                    to={`/analysis/${s.clientId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                  >
                    <i className="mdi mdi-badminton text-2xl text-emerald-600" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {s.title ?? t.session.untitled} · {when(s.recordedAt, locale)}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <AnalysisBadge s={s} />
                        <UploadBadge s={s} />
                        <Pill tone="muted">{formatDuration(s.durationS)}</Pill>
                        {s.format && <Pill tone="muted">{t.formats[s.format]}</Pill>}
                      </div>
                      <SummaryLine s={s.summary} />
                    </div>
                    {s.analysis.state === "needs-court" && (
                      <span className="button small yellow">{t.needsCourt}</span>
                    )}
                    {(s.analysis.state === "waiting" || s.analysis.state === "failed") && (
                      <button
                        className="button small green"
                        onClick={(e) => {
                          e.preventDefault();
                          manager.queueAnalysis(s.clientId);
                        }}
                      >
                        {s.analysis.state === "failed" ? t.retry : t.analyseNow}
                      </button>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {others.length > 0 && (
          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon">
                  <i className="mdi mdi-cloud-outline" />
                </span>
                {t.otherDevice}
              </p>
            </header>
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {others.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/analysis/s/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                  >
                    <i className="mdi mdi-cloud-outline text-2xl text-sky-600" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {r.title ?? t.session.untitled} · {when(r.recordedAt, locale)}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Pill tone={r.status === "analysed" ? "ok" : r.status === "failed" ? "err" : "muted"}>
                          {r.status === "analysed" ? t.analysed : r.status === "analysing" ? t.analysing : t.queued}
                        </Pill>
                        <Pill tone="muted">{formatDuration(r.durationS)}</Pill>
                        {r.format && <Pill tone="muted">{t.formats[r.format]}</Pill>}
                      </div>
                      <SummaryLine s={r.summary} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {usage.data && (
          <div className="text-xs text-gray-500">
            <div className="flex justify-between">
              <span>{t.storage}</span>
              <span>
                {formatBytes(usage.data.usedBytes)} / {formatBytes(usage.data.limitBytes)}
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded mt-1">
              <div
                className={`h-1.5 rounded ${usage.data.usedBytes > usage.data.limitBytes ? "bg-red-500" : "bg-sky-500"}`}
                style={{ width: `${Math.min(100, (usage.data.usedBytes / usage.data.limitBytes) * 100)}%` }}
              />
            </div>
            <p className="mt-1">{t.storageNote}</p>
          </div>
        )}
      </section>
    </>
  );
}
