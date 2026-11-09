/**
 * /analysis/:key (local session) and /analysis/s/:serverId (cloud session): playback with overlay, stats, shot
 * review, player/game/training links, court adjustment, export & share, retention and deletion.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Frame, Link2, ListChecks, Pencil, Pin, PinOff, Share2, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "@/app/context";
import { useSessionUser } from "@/features/auth";
import { clubQuery } from "@/features/clubs";
import { myGamesQuery, scoreLine } from "@/features/games";
import { rallyKeys, rallySessionQuery } from "@/features/rally/api";
import { edenRallyRepo } from "@/features/rally/eden-repo";
import { applyCorrections } from "@/features/rally/engine/stats";
import type { AnalysisResult, Calibration, Corrections, PlayerId, SessionFormat } from "@/features/rally/engine/types";
import type { ClipScope } from "@/features/rally/media/clips";
import { downloadFile } from "@/features/rally/media/exporter";
import { buddyTheme, LABELS_EN, LABELS_PT } from "@/features/rally/overlay/theme";
import { summarise } from "@/features/rally/sessions/manager";
import { Page } from "@/shared/components/page-header";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Progress } from "@/shared/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { CornersEditor } from "./CornersEditor";
import { ExportDialog } from "./ExportDialog";
import { GpuNotice } from "./GpuNotice";
import { formatDuration, useLocalSessions, useObjectUrl, useOnline, useSessionManager } from "./hooks";
import { OverlayPlayer, type OverlayPlayerHandle } from "./OverlayPlayer";
import { ShotReview } from "./ShotReview";
import { AnalysisBadge, Pill, UploadBadge } from "./StatusBadges";

const NONE = "__none";

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="tabular mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

function RenameDialog({ title, open, onOpenChange, onSave }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; onSave: (t: string | null) => void }) {
  const dict = useDictionary();
  const [value, setValue] = useState(title);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.rally.session.rename}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(value.trim() || null);
            onOpenChange(false);
          }}
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} autoFocus />
          <DialogFooter>
            <Button type="submit">{dict.ui.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SessionPage({ clientKey, serverId: routeServerId }: { clientKey?: string; serverId?: string }) {
  const dict = useDictionary();
  const t = dict.rally;
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const user = useSessionUser();
  const { api, queryClient } = useAppContext();
  const repo = useMemo(() => edenRallyRepo(api), [api]);
  const manager = useSessionManager();
  const localAll = useLocalSessions();
  const online = useOnline();
  const playerRef = useRef<OverlayPlayerHandle>(null);

  const local = clientKey ? localAll.find((s) => s.clientId === clientKey) : localAll.find((s) => s.serverId === routeServerId);
  const sid = local?.serverId ?? routeServerId;
  const remote = useQuery({ ...rallySessionQuery(api, sid ?? "none"), enabled: !!sid && online });
  const server = remote.data;
  const isOwner = !server || server.ownerId === user.id;
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
  const setDraft = (next: Corrections | ((d: Corrections) => Corrections)) => setEdit(typeof next === "function" ? next(draft) : next);
  const effective = useMemo(() => (result ? applyCorrections(result, draft) : null), [result, draft]);

  // ── names for linked players: the club roster ───────────────────────────
  const club = useQuery({ ...clubQuery(api, user.clubId ?? ""), enabled: !!user.clubId && online });
  const roster = useMemo(() => club.data?.members ?? [], [club.data]);
  const participants = useMemo(() => server?.participants ?? [], [server?.participants]);
  const names = useMemo(() => {
    const out: Partial<Record<PlayerId, string>> = {};
    for (const p of participants) {
      const member = roster.find((m) => m.id === p.userId);
      if (member?.name) out[p.playerId as PlayerId] = member.name.split(" ")[0]!;
    }
    return out;
  }, [participants, roster]);
  const games = useQuery({ ...myGamesQuery(api), enabled: online && isOwner });

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
  const [renaming, setRenaming] = useState(false);
  const [exportOpen, setExportOpen] = useState<{ scope?: ClipScope; at: number } | null>(null);
  const openExport = (scope?: ClipScope) => setExportOpen({ scope, at: playerRef.current?.currentTime() ?? 0 });
  const [cornerFrame, setCornerFrame] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!local && !routeServerId) {
    return (
      <Page>
        <Alert>
          <AlertDescription>{t.session.notFound}</AlertDescription>
        </Alert>
      </Page>
    );
  }
  if (!clientKey && local) return <Navigate to="/analysis/$key" params={{ key: local.clientId }} replace />;

  const title = local?.title ?? server?.title ?? t.session.untitled;
  const recordedAt = new Date(local?.recordedAt ?? server?.recordedAt ?? 0);
  const durationS = local?.durationS ?? server?.durationS ?? 0;
  const format: SessionFormat | null = (draft.format ?? local?.format ?? server?.format ?? effective?.format ?? null) as SessionFormat | null;
  const stats = effective?.stats ?? local?.summary?.stats ?? server?.summary?.stats ?? null;

  const updateServer = async (patch: Parameters<typeof repo.update>[1]) => {
    if (!sid) return;
    await repo.update(sid, patch);
    await queryClient.invalidateQueries({ queryKey: rallyKeys.all });
  };

  const saveCorrections = async () => {
    setSaving(true);
    try {
      if (local) await manager.saveCorrections(local.clientId, draft);
      else if (sid && result) {
        await repo.update(sid, { corrections: draft });
        const summary = summarise(result, draft);
        await repo.submitResult(sid, { summary, format: summary.format, deviceId: "review" }).catch(() => undefined);
        await queryClient.invalidateQueries({ queryKey: rallyKeys.all });
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
    c.getContext("2d")?.drawImage(v, 0, 0);
    setCornerFrame(c);
  };

  const getExportVideo = async () => {
    if (videoBlob) return videoBlob;
    if (remoteVideoUrl) return (await fetch(remoteVideoUrl)).blob();
    return null;
  };

  const summaryOnly = !!server && server.access === "summary";
  const lowCourt = effective?.calibration?.source === "auto" && (effective.calibration.score ?? 0) < 0.7;
  const analysing = local?.analysis.state === "running";

  return (
    <Page>
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/analysis">
            <ArrowLeft /> {t.title}
          </Link>
        </Button>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
              {isOwner && (
                <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t.session.rename} onClick={() => setRenaming(true)}>
                  <Pencil />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span>{recordedAt.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>· {formatDuration(durationS)}</span>
              {local && <AnalysisBadge s={local} />}
              {local && <UploadBadge s={local} />}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <Select
                value={format ?? undefined}
                onValueChange={(v) => {
                  const f = v as SessionFormat;
                  if (local) void manager.setFormat(local.clientId, f).then(() => manager.queueAnalysis(local.clientId));
                  else void updateServer({ format: f });
                }}
              >
                <SelectTrigger className="w-40" aria-label={t.session.format}>
                  <SelectValue placeholder={t.session.format} />
                </SelectTrigger>
                <SelectContent>
                  {(["singles", "doubles", "practice"] as const).map((f) => (
                    <SelectItem key={f} value={f}>
                      {t.formats[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {effective && videoSrc && (
              <Button onClick={() => openExport()}>
                <Share2 /> {t.session.export}
              </Button>
            )}
          </div>
        </div>
      </div>

      {summaryOnly && (
        <Alert>
          <AlertDescription>{t.session.summaryOnly}</AlertDescription>
        </Alert>
      )}
      {exportOpen && effective && videoSrc && (
        <ExportDialog
          result={effective}
          names={names}
          labels={lang === "pt-PT" ? LABELS_PT : LABELS_EN}
          src={videoSrc}
          getVideo={getExportVideo}
          title={title}
          initialScope={exportOpen.scope}
          currentTime={exportOpen.at}
          onClose={() => setExportOpen(null)}
        />
      )}

      {/* ── Player / analysis state ─────────────────────────────────────── */}
      {!summaryOnly && (
        <Card className="overflow-hidden">
          <CardContent className="space-y-3">
            {local?.analysis.state === "needs-court" && courtCheckFrame && local.courtGuess ? (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">{t.courtCheck.title}</h2>
                <p className="text-sm text-muted-foreground">{t.courtCheck.hint}</p>
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
              <OverlayPlayer ref={playerRef} src={videoSrc} result={effective} names={names} labels={lang === "pt-PT" ? LABELS_PT : LABELS_EN} controlLabels={t.session} />
            ) : videoSrc ? (
              <div className="space-y-3">
                <video src={videoSrc} controls playsInline className="w-full rounded-xl bg-black" />
                {local && !analysing && local.analysis.state !== "done" && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button onClick={() => manager.queueAnalysis(local.clientId)}>{local.analysis.state === "failed" ? t.retry : t.analyseNow}</Button>
                    <span className="text-xs text-muted-foreground">
                      {local.analysis.error ? `${local.analysis.error} · ` : ""}
                      {t.keepOpen}
                    </span>
                  </div>
                )}
                {local && !analysing && local.analysis.state !== "done" && <GpuNotice />}
                {analysing && local && (
                  <div className="space-y-2">
                    <div className="text-sm">
                      {t.analysing} · {t.phases[(local.analysis.phase as keyof typeof t.phases) ?? "scan"]} {Math.round((local.analysis.progress ?? 0) * 100)}%
                    </div>
                    <Progress value={Math.round((local.analysis.progress ?? 0) * 100)} />
                    <p className="text-xs text-muted-foreground">{t.keepOpen}</p>
                    <GpuNotice />
                  </div>
                )}
                {!local && server && isOwner && server.status !== "analysed" && (
                  <Button
                    disabled={busy === "fetch"}
                    onClick={async () => {
                      setBusy("fetch");
                      try {
                        const id = await manager.fetchRemote(server);
                        await navigate({ to: "/analysis/$key", params: { key: id } });
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {t.analyseHere}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{t.session.noVideo}</p>
            )}
            {effective && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t.session.approx}</span>
                {local?.hasLocalVideo && isOwner && (
                  <Button size="sm" variant="outline" onClick={openCornerEditor}>
                    <Frame /> {t.session.adjustCourt}
                  </Button>
                )}
              </div>
            )}
            {lowCourt && local?.hasLocalVideo && (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertDescription>
                  <span>
                    {t.session.courtLow}{" "}
                    <button type="button" className="font-medium underline" onClick={openCornerEditor}>
                      {t.session.adjustCourt}
                    </button>
                  </span>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      {stats && (
        <Card>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t.session.rallies} value={stats.rallies} />
              <Stat label={t.session.shots} value={stats.shots} />
              <Stat label={t.session.avgRally} value={stats.avgRallyShots || "—"} />
              <Stat label={t.session.longestRally} value={stats.longestRallyShots || "—"} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.session.players}</TableHead>
                  {isOwner && effective && !summaryOnly && <TableHead className="w-24" />}
                  <TableHead className="text-right">{t.session.distance}</TableHead>
                  <TableHead className="text-right">{t.session.shots}</TableHead>
                  <TableHead className="text-right">{t.session.maxSpeed}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.players.map((p) => {
                  const linked = participants.find((x) => x.playerId === p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="align-top whitespace-normal">
                        <div className="flex items-center gap-2">
                          <span className="inline-block size-2.5 rounded-full" style={{ background: buddyTheme.players[p.id] }} />
                          <span className="font-semibold">{p.id}</span>
                          {isOwner && sid ? (
                            <Select
                              value={linked?.userId ?? NONE}
                              onValueChange={(v) => {
                                const others = participants.filter((x) => x.playerId !== p.id);
                                const next = v !== NONE ? [...others, { playerId: p.id, userId: v }] : others;
                                void updateServer({ participants: next });
                              }}
                            >
                              <SelectTrigger size="sm" className="h-7 max-w-44 text-xs" aria-label={t.session.linkPlayer}>
                                <SelectValue placeholder={t.session.linkPlayer} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>{t.session.linkPlayer}</SelectItem>
                                {roster.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name ?? m.email ?? m.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">{names[p.id] ?? ""}</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(p.shotsByType).map(([ty, n]) => (
                            <Pill key={ty} tone="muted">
                              {t.shotTypes[ty as keyof typeof t.shotTypes]} {n}
                            </Pill>
                          ))}
                        </div>
                      </TableCell>
                      {isOwner && effective && !summaryOnly && (
                        <TableCell className="align-top">
                          <Select
                            value=""
                            onValueChange={(other) => {
                              if (!other) return;
                              const t0 = playerRef.current?.currentTime() ?? 0;
                              setDraft((d) => ({ ...d, swaps: [...(d.swaps ?? []), [Math.round(t0 * 10) / 10, p.id as PlayerId, other as PlayerId]] }));
                            }}
                          >
                            <SelectTrigger size="sm" className="h-7 text-xs" title={t.session.swap} aria-label={t.session.swap}>
                              <SelectValue placeholder="⇄" />
                            </SelectTrigger>
                            <SelectContent>
                              {stats.players
                                .filter((o) => o.id !== p.id)
                                .map((o) => (
                                  <SelectItem key={o.id} value={o.id}>
                                    ⇄ {o.id}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      <TableCell className="tabular text-right align-top">~{p.distanceM} m</TableCell>
                      <TableCell className="tabular text-right align-top">{p.shots}</TableCell>
                      <TableCell className="tabular text-right align-top">{p.maxSpeedKmh ? `~${p.maxSpeedKmh} km/h` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Review ──────────────────────────────────────────────────────── */}
      {effective && !summaryOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4 text-primary" /> {t.session.review}
            </CardTitle>
            <CardDescription>{t.session.reviewHint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ShotReview
              effective={effective}
              draft={draft}
              onDraft={(c) => setDraft(c)}
              names={names}
              onSeek={(s) => playerRef.current?.seek(s)}
              onClip={videoSrc ? openExport : undefined}
              onAdd={() => {
                const at = Math.round((playerRef.current?.currentTime() ?? 0) * 100) / 100;
                setDraft((d) => ({ ...d, added: [...(d.added ?? []), { id: `add-${Date.now().toString(36)}`, t: at, hitter: null, type: "other" }] }));
              }}
              readOnly={!isOwner}
            />
            {isOwner && (
              <div className="flex justify-end">
                <Button disabled={!dirty || saving} onClick={() => void saveCorrections()}>
                  {saving ? t.session.saving : dirty ? t.session.save : t.session.saved}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Links & management ──────────────────────────────────────────── */}
      {sid && server && (
        <Card>
          <CardContent className="space-y-4 text-sm">
            {isOwner && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{t.session.linkGame}</FieldLabel>
                  <Select value={server.gameId ?? NONE} onValueChange={(v) => void updateServer({ gameId: v === NONE ? null : v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t.session.none}</SelectItem>
                      {(games.data ?? []).slice(0, 30).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {new Date(g.playedAt).toLocaleDateString(lang)} · {scoreLine(g, user.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rally-training-date">{t.session.linkTraining}</FieldLabel>
                  <Input id="rally-training-date" type="date" value={server.trainingDate ?? ""} onChange={(e) => void updateServer({ trainingDate: e.target.value || null })} />
                </Field>
              </div>
            )}
            {server.gameId && (
              <Button variant="link" asChild className="h-auto px-0">
                <Link to="/games/$gameId" params={{ gameId: server.gameId }}>
                  <Link2 /> {t.session.linkGame}
                </Link>
              </Button>
            )}
            {isOwner && server.hasVideo && (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" onClick={() => void updateServer({ pinned: !server.pinned })}>
                  {server.pinned ? <PinOff /> : <Pin />}
                  {server.pinned ? t.session.unpin : t.session.pin}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {server.pinned ? t.session.pinned : server.videoExpiresAt ? `${t.session.expires} ${server.videoExpiresAt.toLocaleDateString(lang)}` : ""}
                </span>
              </div>
            )}
            {isOwner && (
              <div className="flex items-center gap-3">
                <Switch id="share-training" checked={!!server.shareForTraining} onCheckedChange={(v) => void updateServer({ shareForTraining: v })} />
                <Label htmlFor="share-training" className="text-xs font-normal text-muted-foreground">
                  {t.session.shareTraining}
                </Label>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {isOwner && result && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadFile(
                new Blob([JSON.stringify({ result, corrections: savedCorrections })], { type: "application/json" }),
                `${title.replace(/[^\w-]+/g, "_")}-analysis.json`,
              )
            }
          >
            <Download /> {t.session.downloadAnalysis}
          </Button>
        )}
        {local?.hasLocalVideo && local.upload.state === "done" && (
          <Button size="sm" variant="outline" onClick={() => void manager.dropLocalVideo(local.clientId)}>
            {t.session.deleteLocal}
          </Button>
        )}
        {!isOwner && sid && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await repo.leave(sid);
              await queryClient.invalidateQueries({ queryKey: rallyKeys.all });
              await navigate({ to: "/analysis" });
            }}
          >
            {t.session.leave}
          </Button>
        )}
        {isOwner && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 /> {t.session.deleteEverywhere}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.session.deleteEverywhere}</AlertDialogTitle>
                <AlertDialogDescription>{t.session.confirmDelete}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{dict.ui.common.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={async () => {
                    if (local) await manager.remove(local.clientId, true);
                    else if (sid) await repo.delete(sid);
                    await queryClient.invalidateQueries({ queryKey: rallyKeys.all });
                    await navigate({ to: "/analysis" });
                  }}
                >
                  {dict.ui.common.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {renaming && (
        <RenameDialog
          title={title}
          open
          onOpenChange={setRenaming}
          onSave={(next) => {
            if (local) void manager.rename(local.clientId, next);
            else void updateServer({ title: next });
          }}
        />
      )}
    </Page>
  );
}
