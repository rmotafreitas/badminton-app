/**
 * /analysis/:key (local session) and /analysis/s/:serverId (cloud session):
 * playback with overlay, stats, shot review, player/game/training links,
 * court adjustment, export & share, retention and deletion.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useDictionary, useLanguage } from "@/i18n";
import { useGameService, useRallyRepo, useUserService } from "@/di/container";
import { useAuth } from "@/hooks/useAuth";
import { invalidateQueries, useQuery } from "@/hooks/useQuery";
import type { RallySession } from "@/core/domain/rally";
import { applyCorrections } from "../engine/stats";
import type { AnalysisResult, Calibration, Corrections, PlayerId, SessionFormat } from "../engine/types";
import { canShareFile, downloadFile, exportWithOverlay, shareFile } from "../media/exporter";
import { LABELS_EN, LABELS_PT } from "../overlay/theme";
import { buddyTheme } from "../overlay/theme";
import { summarise } from "../sessions/manager";
import { CornersEditor } from "./CornersEditor";
import { OverlayPlayer, type OverlayPlayerHandle } from "./OverlayPlayer";
import { ShotReview } from "./ShotReview";
import { AnalysisBadge, Pill, UploadBadge } from "./StatusBadges";
import { formatDuration, useLocalSessions, useObjectUrl, useOnline, useSessionManager } from "./hooks";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-slate-800/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

export default function SessionPage() {
  const { key, serverId: routeServerId } = useParams();
  const dict = useDictionary();
  const t = dict.rally;
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const repo = useRallyRepo();
  const userService = useUserService();
  const gameService = useGameService();
  const manager = useSessionManager();
  const localAll = useLocalSessions();
  const online = useOnline();
  const playerRef = useRef<OverlayPlayerHandle>(null);

  const local = key ? localAll.find((s) => s.clientId === key) : localAll.find((s) => s.serverId === routeServerId);
  const sid = local?.serverId ?? routeServerId;
  const remote = useQuery(["rally-session", sid ?? "none"], () => repo.get(sid!), { enabled: !!sid && online });
  const server: RallySession | undefined = remote.data;
  const isOwner = !server || server.ownerId === user?.userId;
  const fullAccess = !server || server.access === "full";

  // ── video ────────────────────────────────────────────────────────────────
  // Async loads are keyed so stale results never show for another session.
  const [loadedVideo, setLoadedVideo] = useState<{ key: string; blob: Blob | null } | null>(null);
  const [loadedRemoteUrl, setLoadedRemoteUrl] = useState<{ key: string; url: string | null } | null>(null);
  const videoKey = local?.hasLocalVideo ? local.clientId : null;
  useEffect(() => {
    if (!videoKey) return;
    let off = false;
    void manager.getVideo(videoKey).then((b) => !off && setLoadedVideo({ key: videoKey, blob: b ?? null }));
    return () => {
      off = true;
    };
  }, [videoKey, manager]);
  const remoteKey = !local?.hasLocalVideo && sid && server?.hasVideo && fullAccess ? sid : null;
  useEffect(() => {
    if (!remoteKey) return;
    void repo.videoUrl(remoteKey).then(
      (r) => setLoadedRemoteUrl({ key: remoteKey, url: r.url }),
      () => setLoadedRemoteUrl({ key: remoteKey, url: null }),
    );
  }, [remoteKey, repo]);
  const videoBlob = videoKey && loadedVideo?.key === videoKey ? loadedVideo.blob : null;
  const remoteVideoUrl = remoteKey && loadedRemoteUrl?.key === remoteKey ? loadedRemoteUrl.url : null;
  const localUrl = useObjectUrl(videoBlob);
  const videoSrc = localUrl ?? remoteVideoUrl;

  // ── result + corrections ────────────────────────────────────────────────
  const [loadedResult, setLoadedResult] = useState<{ key: string; result: AnalysisResult | null } | null>(null);
  const resultKey =
    local?.analysis.state === "done"
      ? `local:${local.clientId}:${local.summary?.stats.shots ?? 0}`
      : !local && sid && server?.hasResult && fullAccess
        ? `remote:${sid}`
        : null;
  useEffect(() => {
    if (!resultKey) return;
    let off = false;
    const [kind, id] = resultKey.split(":") as [string, string];
    const load = kind === "local" ? manager.getResult(id) : manager.fetchRemoteResult(id);
    void load.then(
      (r) => !off && setLoadedResult({ key: resultKey, result: r ?? null }),
      () => !off && setLoadedResult({ key: resultKey, result: null }),
    );
    return () => {
      off = true;
    };
  }, [resultKey, manager]);
  const result = resultKey && loadedResult?.key === resultKey ? loadedResult.result : null;

  const savedCorrections: Corrections = local?.corrections ?? (server?.corrections as Corrections) ?? {};
  // null until the person edits something; then a draft until saved.
  const [edit, setEdit] = useState<Corrections | null>(null);
  const draft = edit ?? savedCorrections;
  const dirty = edit !== null;
  const setDraft = (next: Corrections | ((d: Corrections) => Corrections)) =>
    setEdit(typeof next === "function" ? next(draft) : next);
  const effective = useMemo(() => (result ? applyCorrections(result, draft) : null), [result, draft]);

  // ── names for linked players ────────────────────────────────────────────
  const users = useQuery(["users"], () => userService.getAllUsers(), { enabled: online });
  const participants = useMemo(() => server?.participants ?? [], [server?.participants]);
  const names = useMemo(() => {
    const out: Partial<Record<PlayerId, string>> = {};
    for (const p of participants) {
      const u = users.data?.find((x) => x.id === p.userId);
      if (u?.profile?.name) out[p.playerId as PlayerId] = u.profile.name.split(" ")[0]!;
    }
    return out;
  }, [participants, users.data]);

  const games = useQuery(["my-games"], () => gameService.getMyGames(), { enabled: online && isOwner });

  // ── court check (players-removed frame + detected guess) ────────────────
  const [courtFrame, setCourtFrame] = useState<{ key: string; bitmap: ImageBitmap } | null>(null);
  const needsCourtKey = local?.analysis.state === "needs-court" ? local.clientId : null;
  useEffect(() => {
    if (!needsCourtKey) return;
    let off = false;
    void manager.getCourtFrame(needsCourtKey).then(async (b) => {
      if (!b || off) return;
      const bitmap = await createImageBitmap(b);
      if (!off) setCourtFrame({ key: needsCourtKey, bitmap });
    });
    return () => {
      off = true;
    };
  }, [needsCourtKey, manager]);
  const courtCheckFrame = needsCourtKey && courtFrame?.key === needsCourtKey ? courtFrame.bitmap : null;

  // ── ui state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState<{ blob: Blob; name: string } | null>(null);
  const [cornerFrame, setCornerFrame] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!local && !routeServerId) {
    return (
      <section className="section main-section">
        <div className="card">
          <div className="card-content">{t.session.notFound}</div>
        </div>
      </section>
    );
  }
  if (!key && local) return <Navigate to={`/analysis/${local.clientId}`} replace />;

  const title = local?.title ?? server?.title ?? t.session.untitled;
  const recordedAt = new Date(local?.recordedAt ?? server?.recordedAt ?? 0);
  const durationS = local?.durationS ?? server?.durationS ?? 0;
  const format: SessionFormat | null = (draft.format ?? local?.format ?? server?.format ?? effective?.format ?? null) as SessionFormat | null;
  const stats = effective?.stats ?? local?.summary?.stats ?? server?.summary?.stats ?? null;

  const updateServer = async (patch: Parameters<typeof repo.update>[1]) => {
    if (!sid) return;
    await repo.update(sid, patch);
    invalidateQueries(["rally-session", sid]);
    remote.refetch();
  };

  const saveCorrections = async () => {
    setSaving(true);
    try {
      if (local) await manager.saveCorrections(local.clientId, draft);
      else if (sid && result) {
        await repo.update(sid, { corrections: draft });
        const summary = summarise(result, draft);
        await repo
          .submitResult(sid, { summary, format: summary.format, deviceId: "review" })
          .catch(() => undefined);
        remote.refetch();
      }
      setEdit(null);
    } finally {
      setSaving(false);
    }
  };

  const openCornerEditor = () => {
    const v = playerRef.current?.video();
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setCornerFrame(c);
  };

  const doExport = async () => {
    if (!effective) return;
    let blob = videoBlob;
    if (!blob && remoteVideoUrl) blob = await (await fetch(remoteVideoUrl)).blob();
    if (!blob) return;
    setExporting(0);
    setExportError(null);
    try {
      const out = await exportWithOverlay(blob, {
        result: effective,
        names,
        theme: buddyTheme,
        labels: lang === "pt-PT" ? LABELS_PT : LABELS_EN,
        onProgress: (p) => setExporting(p),
      });
      setExported({ blob: out, name: `${title.replace(/[^\w-]+/g, "_")}-rally.mp4` });
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const summaryOnly = !!server && server.access === "summary";
  const lowCourt = effective?.calibration?.source === "auto" && (effective.calibration.score ?? 0) < 0.7;

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <Link to="/analysis" className="text-sm text-gray-500 hover:underline">
              ← {t.title}
            </Link>
            <h1
              className="title truncate"
              onClick={() => {
                if (!isOwner) return;
                const next = prompt(t.session.rename, title);
                if (next === null) return;
                if (local) void manager.rename(local.clientId, next.trim() || null);
                else void updateServer({ title: next.trim() || null });
              }}
            >
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-sm text-gray-500">
              <span>{recordedAt.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>· {formatDuration(durationS)}</span>
              {local && <AnalysisBadge s={local} />}
              {local && <UploadBadge s={local} />}
            </div>
          </div>
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              <select
                value={format ?? ""}
                onChange={(e) => {
                  const f = e.target.value as SessionFormat;
                  if (local) {
                    void manager.setFormat(local.clientId, f).then(() => manager.queueAnalysis(local.clientId));
                  } else void updateServer({ format: f });
                }}
                className="border rounded px-2 py-1 bg-transparent text-sm"
                aria-label={t.session.format}
              >
                <option value="" disabled>
                  {t.session.format}
                </option>
                {(["singles", "doubles", "practice"] as const).map((f) => (
                  <option key={f} value={f}>
                    {t.formats[f]}
                  </option>
                ))}
              </select>
              {effective && videoSrc && (
                <button className="button blue" disabled={exporting !== null} onClick={() => void doExport()}>
                  <span className="icon">
                    <i className="mdi mdi-share-variant" />
                  </span>
                  <span>
                    {exporting !== null ? `${t.session.exporting} ${Math.round(exporting * 100)}%` : t.session.export}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="section main-section space-y-4">
        {summaryOnly && <div className="notification blue">{t.session.summaryOnly}</div>}
        {exportError && <div className="notification red">{exportError}</div>}
        {exported && (
          <div className="card">
            <div className="card-content flex flex-wrap items-center gap-2">
              <i className="mdi mdi-check-circle text-emerald-600 text-xl" />
              <span className="flex-1 text-sm">{exported.name}</span>
              {canShareFile(exported.blob, exported.name) && (
                <button className="button green" onClick={() => void shareFile(exported.blob, exported.name)}>
                  <i className="mdi mdi-share-variant mr-1" />
                  {t.session.share}
                </button>
              )}
              <button className="button blue" onClick={() => downloadFile(exported.blob, exported.name)}>
                <i className="mdi mdi-download mr-1" />
                {t.session.download}
              </button>
              <button className="button light" onClick={() => setExported(null)} aria-label="Close">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Player / analysis state ─────────────────────────────────────── */}
        {!summaryOnly && (
          <div className="card">
            <div className="card-content">
              {local?.analysis.state === "needs-court" && courtCheckFrame && local.courtGuess ? (
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">{t.courtCheck.title}</h2>
                  <p className="text-sm text-gray-500">{t.courtCheck.hint}</p>
                  <CornersEditor
                    frame={courtCheckFrame}
                    width={local.courtGuess.width}
                    height={local.courtGuess.height}
                    initial={local.courtGuess.corners}
                    doneLabel={t.courtCheck.confirm}
                    onDone={(c) => void manager.setCorners(local.clientId, c)}
                  />
                </div>
              ) : cornerFrame ? (
                <CornersEditor
                  frame={cornerFrame}
                  width={cornerFrame.width}
                  height={cornerFrame.height}
                  initial={(local?.corners ?? effective?.calibration?.corners) as Calibration["corners"] | undefined}
                  onCancel={() => setCornerFrame(null)}
                  onDone={(c) => {
                    setCornerFrame(null);
                    if (local) void manager.setCorners(local.clientId, c);
                  }}
                />
              ) : effective && videoSrc ? (
                <OverlayPlayer
                  ref={playerRef}
                  src={videoSrc}
                  result={effective}
                  names={names}
                  labels={lang === "pt-PT" ? LABELS_PT : LABELS_EN}
                />
              ) : videoSrc ? (
                <div className="space-y-3">
                  <video src={videoSrc} controls playsInline className="w-full rounded-xl bg-black" />
                  {local && local.analysis.state !== "running" && local.analysis.state !== "done" && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <button className="button green" onClick={() => manager.queueAnalysis(local.clientId)}>
                        {local.analysis.state === "failed" ? t.retry : t.analyseNow}
                      </button>
                      <span className="text-xs text-gray-500">
                        {local.analysis.error ? `${local.analysis.error} · ` : ""}
                        {t.keepOpen}
                      </span>
                    </div>
                  )}
                  {local?.analysis.state === "running" && (
                    <div>
                      <div className="text-sm">
                        {t.analysing} · {t.phases[(local.analysis.phase as keyof typeof t.phases) ?? "scan"]}{" "}
                        {Math.round((local.analysis.progress ?? 0) * 100)}%
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded mt-2">
                        <div
                          className="h-2 rounded bg-emerald-500"
                          style={{ width: `${Math.round((local.analysis.progress ?? 0) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">{t.keepOpen}</p>
                    </div>
                  )}
                  {!local && server && isOwner && server.status !== "analysed" && (
                    <button
                      className="button green"
                      disabled={busy === "fetch"}
                      onClick={async () => {
                        setBusy("fetch");
                        try {
                          const id = await manager.fetchRemote(server);
                          navigate(`/analysis/${id}`);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {t.analyseHere}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">{t.session.noVideo}</p>
              )}
              {effective && (
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-gray-500">
                  <span>{t.session.approx}</span>
                  {local?.hasLocalVideo && isOwner && (
                    <button className="button small light" onClick={openCornerEditor}>
                      <i className="mdi mdi-vector-square mr-1" />
                      {t.session.adjustCourt}
                    </button>
                  )}
                </div>
              )}
              {lowCourt && local?.hasLocalVideo && (
                <div className="notification yellow mt-3 text-sm">
                  {t.session.courtLow}{" "}
                  <button className="underline" onClick={openCornerEditor}>
                    {t.session.adjustCourt}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        {stats && (
          <div className="card">
            <div className="card-content space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label={t.session.rallies} value={stats.rallies} />
                <Stat label={t.session.shots} value={stats.shots} />
                <Stat label={t.session.avgRally} value={stats.avgRallyShots || "—"} />
                <Stat label={t.session.longestRally} value={stats.longestRallyShots || "—"} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="py-1">{t.session.players}</th>
                      {isOwner && effective && !summaryOnly && <th className="py-1" />}
                      <th className="py-1 text-right">{t.session.distance}</th>
                      <th className="py-1 text-right">{t.session.shots}</th>
                      <th className="py-1 text-right">{t.session.maxSpeed}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.players.map((p) => {
                      const linked = participants.find((x) => x.playerId === p.id);
                      return (
                        <tr key={p.id} className="border-t border-gray-100 dark:border-slate-800">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ background: buddyTheme.players[p.id] }}
                              />
                              <span className="font-semibold">{p.id}</span>
                              {isOwner && sid ? (
                                <select
                                  value={linked?.userId ?? ""}
                                  onChange={(e) => {
                                    const others = participants.filter((x) => x.playerId !== p.id);
                                    const next = e.target.value
                                      ? [...others, { playerId: p.id, userId: e.target.value }]
                                      : others;
                                    void updateServer({ participants: next });
                                  }}
                                  className="bg-transparent border rounded px-1 py-0.5 text-xs max-w-[10rem]"
                                  aria-label={t.session.linkPlayer}
                                >
                                  <option value="">{t.session.linkPlayer}</option>
                                  {(users.data ?? []).map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.profile?.name ?? u.email ?? u.id}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-500">{names[p.id] ?? ""}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(p.shotsByType).map(([ty, n]) => (
                                <Pill key={ty} tone="muted">
                                  {t.shotTypes[ty as keyof typeof t.shotTypes]} {n}
                                </Pill>
                              ))}
                            </div>
                          </td>
                          {isOwner && effective && !summaryOnly && (
                            <td className="py-2 pr-2">
                              <select
                                value=""
                                onChange={(e) => {
                                  const other = e.target.value as PlayerId;
                                  if (!other) return;
                                  const t0 = playerRef.current?.currentTime() ?? 0;
                                  setDraft((d) => ({
                                    ...d,
                                    swaps: [...(d.swaps ?? []), [Math.round(t0 * 10) / 10, p.id as PlayerId, other]],
                                  }));
                                }}
                                className="bg-transparent border rounded px-1 py-0.5 text-xs"
                                title={t.session.swap}
                                aria-label={t.session.swap}
                              >
                                <option value="">⇄</option>
                                {stats.players
                                  .filter((o) => o.id !== p.id)
                                  .map((o) => (
                                    <option key={o.id} value={o.id}>
                                      ⇄ {o.id}
                                    </option>
                                  ))}
                              </select>
                            </td>
                          )}
                          <td className="py-2 text-right font-mono">~{p.distanceM} m</td>
                          <td className="py-2 text-right font-mono">{p.shots}</td>
                          <td className="py-2 text-right font-mono">{p.maxSpeedKmh ? `~${p.maxSpeedKmh} km/h` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Review ──────────────────────────────────────────────────────── */}
        {effective && !summaryOnly && (
          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon">
                  <i className="mdi mdi-playlist-check" />
                </span>
                {t.session.review}
              </p>
            </header>
            <div className="card-content space-y-3">
              <p className="text-sm text-gray-500">{t.session.reviewHint}</p>
              <ShotReview
                effective={effective}
                draft={draft}
                onDraft={(c) => setDraft(c)}
                names={names}
                onSeek={(s) => playerRef.current?.seek(s)}
                onAdd={() => {
                  const at = Math.round((playerRef.current?.currentTime() ?? 0) * 100) / 100;
                  setDraft((d) => ({
                    ...d,
                    added: [...(d.added ?? []), { id: `add-${Date.now().toString(36)}`, t: at, hitter: null, type: "other" }],
                  }));
                }}
                readOnly={!isOwner}
              />
              {isOwner && (
                <div className="flex justify-end">
                  <button className="button green" disabled={!dirty || saving} onClick={() => void saveCorrections()}>
                    {saving ? t.session.saving : dirty ? t.session.save : t.session.saved}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Links & management ──────────────────────────────────────────── */}
        {sid && server && (
          <div className="card">
            <div className="card-content space-y-3 text-sm">
              {isOwner && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-gray-500">{t.session.linkGame}</span>
                    <select
                      value={server.gameId ?? ""}
                      onChange={(e) => void updateServer({ gameId: e.target.value || null })}
                      className="w-full border rounded px-2 py-1 bg-transparent"
                    >
                      <option value="">{t.session.none}</option>
                      {(games.data ?? []).slice(0, 30).map((g) => (
                        <option key={g.id} value={g.id}>
                          {new Date(g.playedAt).toLocaleDateString(lang)} · {g.resultSummary}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">{t.session.linkTraining}</span>
                    <input
                      type="date"
                      value={server.trainingDate ?? ""}
                      onChange={(e) => void updateServer({ trainingDate: e.target.value || null })}
                      className="w-full border rounded px-2 py-1 bg-transparent"
                    />
                  </label>
                </div>
              )}
              {server.gameId && (
                <Link to={`/games/${server.gameId}`} className="text-sky-600 hover:underline">
                  <i className="mdi mdi-badminton mr-1" />
                  {t.session.linkGame}
                </Link>
              )}
              {isOwner && server.hasVideo && (
                <div className="flex flex-wrap items-center gap-2">
                  <button className="button small light" onClick={() => void updateServer({ pinned: !server.pinned })}>
                    <i className={`mdi ${server.pinned ? "mdi-pin-off" : "mdi-pin"} mr-1`} />
                    {server.pinned ? t.session.unpin : t.session.pin}
                  </button>
                  <span className="text-xs text-gray-500">
                    {server.pinned
                      ? t.session.pinned
                      : server.videoExpiresAt
                        ? `${t.session.expires} ${server.videoExpiresAt.toLocaleDateString(lang)}`
                        : ""}
                  </span>
                </div>
              )}
              {isOwner && (
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={!!server.shareForTraining}
                    onChange={(e) => void updateServer({ shareForTraining: e.target.checked })}
                  />
                  {t.session.shareTraining}
                </label>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {isOwner && result && (
            <button
              className="button small light"
              onClick={() =>
                downloadFile(
                  new Blob([JSON.stringify({ result, corrections: savedCorrections })], { type: "application/json" }),
                  `${title.replace(/[^\w-]+/g, "_")}-analysis.json`,
                )
              }
            >
              {t.session.downloadAnalysis}
            </button>
          )}
          {local?.hasLocalVideo && local.upload.state === "done" && (
            <button className="button small light" onClick={() => void manager.dropLocalVideo(local.clientId)}>
              {t.session.deleteLocal}
            </button>
          )}
          {!isOwner && sid && (
            <button
              className="button small light"
              onClick={async () => {
                await repo.leave(sid);
                navigate("/analysis");
              }}
            >
              {t.session.leave}
            </button>
          )}
          {isOwner && (
            <button
              className="button small red"
              onClick={async () => {
                if (!confirm(t.session.confirmDelete)) return;
                if (local) await manager.remove(local.clientId, true);
                else if (sid) await repo.delete(sid);
                navigate("/analysis");
              }}
            >
              {t.session.deleteEverywhere}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
