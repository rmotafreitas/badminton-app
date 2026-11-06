/**
 * Export sheet: what (whole video / rallies / one shot) × format (landscape
 * or vertical) × framing (whole court / follow the action / follow a player)
 * × overlay on/off — with a live, scrubbable preview of exactly what the file
 * will look like (same draw code as the exporter). Then share or download.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useDictionary } from "@/i18n";
import type { AnalysisResult, PlayerId } from "../engine/types";
import { clock, type ClipFormat, type ClipFraming, type ClipScope } from "../media/clips";
import { canShareFile, downloadFile, exportWithOverlay, planExport, shareFile } from "../media/exporter";
import { buddyTheme, type OverlayLabels } from "../overlay/theme";

interface Props {
  result: AnalysisResult;
  names: Partial<Record<PlayerId, string>>;
  labels: OverlayLabels;
  /** Playable URL of the video (local blob or review copy). */
  src: string;
  getVideo: () => Promise<Blob | null>;
  title: string;
  /** Preselected scope (e.g. from a rally's or a shot's clip button). */
  initialScope?: ClipScope;
  /** Player time when opened: picks the shot/preview frame. */
  currentTime: number;
  onClose: () => void;
}

const PREFS_KEY = "rally-export-prefs";
interface Prefs {
  format: ClipFormat;
  framing: ClipFraming["kind"];
  overlay: boolean;
}
const loadPrefs = (): Partial<Prefs> => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
  } catch {
    return {};
  }
};

function Choice({
  active,
  onClick,
  title,
  hint,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex-1 min-w-0 text-left rounded-xl border px-3 py-2 transition ${
        active
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-emerald-500"
          : "border-gray-200 dark:border-slate-700 hover:border-gray-400"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          {hint && <div className="text-xs text-gray-500 truncate">{hint}</div>}
        </div>
      </div>
    </button>
  );
}

const AspectIcon = ({ w, h }: { w: number; h: number }) => (
  <span
    aria-hidden
    className="inline-block border-2 border-current rounded-sm shrink-0"
    style={{ width: w, height: h }}
  />
);

export function ExportDialog({
  result,
  names,
  labels,
  src,
  getVideo,
  title,
  initialScope,
  currentTime,
  onClose,
}: Props) {
  const t = useDictionary().rally;
  const d = t.exportDialog;
  const [prefs] = useState(loadPrefs);
  const live = useMemo(() => result.shots.filter((s) => !s.deleted).sort((a, b) => a.t - b.t), [result]);
  const rallies = useMemo(
    () => result.rallies.filter((r) => r.shotIds.some((id) => live.some((s) => s.id === id))),
    [result, live],
  );
  const nearestShot = useMemo(() => {
    let best = live[0];
    for (const s of live) if (s.t <= currentTime + 0.3) best = s;
    return best;
  }, [live, currentTime]);

  const [kind, setKind] = useState<ClipScope["kind"]>(initialScope?.kind ?? (rallies.length ? "rallies" : "all"));
  const [rallyIds, setRallyIds] = useState<string[]>(
    initialScope?.kind === "rallies" ? initialScope.ids : rallies.map((r) => r.id),
  );
  const [shotId, setShotId] = useState<string | undefined>(
    initialScope?.kind === "shot" ? initialScope.id : nearestShot?.id,
  );
  const [format, setFormat] = useState<ClipFormat>(prefs.format ?? "vertical");
  const [framingKind, setFramingKind] = useState<ClipFraming["kind"]>(prefs.framing ?? "action");
  const [playerId, setPlayerId] = useState<PlayerId>(result.players[0]?.id ?? "P1");
  const [overlay, setOverlay] = useState(prefs.overlay ?? true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ blob: Blob; name: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ format, framing: framingKind, overlay } satisfies Prefs));
    } catch {
      // Private mode: preferences just aren't remembered.
    }
  }, [format, framingKind, overlay]);

  const scope: ClipScope =
    kind === "all"
      ? { kind: "all" }
      : kind === "rallies"
        ? { kind: "rallies", ids: rallyIds }
        : { kind: "shot", id: shotId ?? "" };
  const framing: ClipFraming =
    framingKind === "player"
      ? { kind: "player", id: playerId }
      : framingKind === "action"
        ? { kind: "action" }
        : { kind: "court" };
  const W = result.video.width;
  const H = result.video.height;
  const durationS = result.video.durationS;
  const opts = { result, names, labels, theme: buddyTheme, scope, format, framing, overlay };
  const optsKey = JSON.stringify({ scope, format, framing, overlay });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- optsKey captures scope/format/framing/overlay
  const plan = useMemo(() => planExport(opts, W, H, durationS), [optsKey, result, names, labels, W, H, durationS]);
  const needsFraming = !(Math.abs(W / H / (format === "vertical" ? 9 / 16 : 16 / 9) - 1) < 0.08);

  // ── live preview: a private <video> seeked within the clip ───────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrub, setScrub] = useState(() => Math.min(plan.duration, 1.5)); // clip time (s)
  const segKey = JSON.stringify(plan.segments);
  const [scrubKey, setScrubKey] = useState(segKey);
  if (scrubKey !== segKey) {
    // New clip range: preview its first moment of play.
    setScrubKey(segKey);
    setScrub(Math.min(plan.duration, 1.5));
  }
  const sourceTime = (() => {
    let left = scrub;
    for (const s of plan.segments) {
      if (left <= s.end - s.start) return s.start + left;
      left -= s.end - s.start;
    }
    return plan.segments[plan.segments.length - 1]?.end ?? 0;
  })();
  const drawRef = useRef(plan.draw);
  const timeRef = useRef(sourceTime);
  useEffect(() => {
    drawRef.current = plan.draw;
    timeRef.current = sourceTime;
  });
  const redraw = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    if (c.width !== plan.width || c.height !== plan.height) {
      c.width = plan.width;
      c.height = plan.height;
    }
    const ctx = c.getContext("2d")!;
    // The preview <video> may be a smaller review copy than the analysis.
    const scale = v.videoWidth / W;
    if (Math.abs(scale - 1) < 1e-3) drawRef.current(ctx, v, v.currentTime);
    else {
      const tmp = new OffscreenCanvas(W, H);
      tmp.getContext("2d")!.drawImage(v, 0, 0, W, H);
      drawRef.current(ctx, tmp, v.currentTime);
    }
  };
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - sourceTime) > 0.02) v.currentTime = sourceTime;
    else redraw();
  });

  const start = async () => {
    setError(null);
    setProgress(0);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const blob = await getVideo();
      if (!blob) throw new Error("Video not available on this device");
      const out = await exportWithOverlay(blob, { ...opts, onProgress: setProgress, signal: ac.signal });
      const what =
        kind === "all"
          ? "full"
          : kind === "rallies"
            ? `rallies-${rallyIds.length}`
            : `shot-${clock(live.find((s) => s.id === shotId)?.t ?? 0).replace(":", "m")}s`;
      setDone({ blob: out, name: `${title.replace(/[^\w-]+/g, "_")}-${what}-${format}.mp4` });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };
  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const empty = !plan.segments.length;
  const busy = progress !== null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={d.title}
      onClick={(e) => e.target === e.currentTarget && !busy && close()}
    >
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-inherit z-10">
          <h2 className="font-semibold">{d.title}</h2>
          <button type="button" className="button small light" onClick={close} aria-label={d.cancel}>
            <i aria-hidden className="mdi mdi-close" />
          </button>
        </div>

        {done ? (
          <div className="p-6 space-y-4 text-center">
            <i aria-hidden className="mdi mdi-check-circle text-emerald-600 text-5xl" />
            <p className="font-semibold">{d.ready}</p>
            <p className="text-sm text-gray-500 break-all">{done.name}</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {canShareFile(done.blob, done.name) && (
                <button className="button green" onClick={() => void shareFile(done.blob, done.name)}>
                  <i aria-hidden className="mdi mdi-share-variant mr-1" />
                  {t.session.share}
                </button>
              )}
              <button className="button blue" onClick={() => downloadFile(done.blob, done.name)}>
                <i aria-hidden className="mdi mdi-download mr-1" />
                {t.session.download}
              </button>
              <button className="button light" onClick={() => setDone(null)}>
                {d.again}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 grid md:grid-cols-[1fr_auto] gap-5">
            <div className="space-y-4 min-w-0">
              {/* What */}
              <fieldset disabled={busy} className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{d.what}</legend>
                <div className="flex flex-wrap gap-2">
                  {rallies.length > 0 && (
                    <Choice
                      active={kind === "rallies"}
                      onClick={() => setKind("rallies")}
                      title={d.rallies}
                      hint={d.ralliesHint}
                    />
                  )}
                  {live.length > 0 && (
                    <Choice active={kind === "shot"} onClick={() => setKind("shot")} title={d.shot} />
                  )}
                  <Choice
                    active={kind === "all"}
                    onClick={() => setKind("all")}
                    title={d.whole}
                    hint={clock(durationS)}
                  />
                </div>
                {kind === "rallies" && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="rounded-full px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-600"
                      onClick={() => setRallyIds(rallyIds.length === rallies.length ? [] : rallies.map((r) => r.id))}
                    >
                      {d.all}
                    </button>
                    {rallies.map((r, i) => {
                      const on = rallyIds.includes(r.id);
                      const n = r.shotIds.filter((id) => live.some((s) => s.id === id)).length;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setRallyIds(on ? rallyIds.filter((x) => x !== r.id) : [...rallyIds, r.id])}
                          className={`rounded-full px-2.5 py-1 text-xs border ${
                            on
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-gray-300 dark:border-slate-600"
                          }`}
                        >
                          {t.session.rally} {i + 1} · {clock(r.start)}–{clock(r.end)} · {n}
                        </button>
                      );
                    })}
                  </div>
                )}
                {kind === "shot" && (
                  <select
                    value={shotId}
                    onChange={(e) => setShotId(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 bg-transparent text-sm"
                    aria-label={d.shot}
                  >
                    {live.map((s) => (
                      <option key={s.id} value={s.id}>
                        {clock(s.t)} · {t.shotTypes[s.type]} · {s.hitter ? (names[s.hitter] ?? s.hitter) : "—"}
                        {s.speedKmh !== null && s.speedConfidence !== "low" ? ` · ~${s.speedKmh} km/h` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </fieldset>

              {/* Format */}
              <fieldset disabled={busy} className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{d.format}</legend>
                <div className="flex flex-wrap gap-2">
                  <Choice
                    active={format === "vertical"}
                    onClick={() => setFormat("vertical")}
                    title={d.vertical}
                    hint={d.verticalHint}
                    icon={<AspectIcon w={12} h={20} />}
                  />
                  <Choice
                    active={format === "landscape"}
                    onClick={() => setFormat("landscape")}
                    title={d.landscape}
                    hint={d.landscapeHint}
                    icon={<AspectIcon w={22} h={13} />}
                  />
                </div>
              </fieldset>

              {/* Framing */}
              {needsFraming && (
                <fieldset disabled={busy} className="space-y-2">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    {d.framing}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    <Choice
                      active={framingKind === "action"}
                      onClick={() => setFramingKind("action")}
                      title={d.action}
                    />
                    <Choice
                      active={framingKind === "player"}
                      onClick={() => setFramingKind("player")}
                      title={d.player}
                    />
                    <Choice active={framingKind === "court"} onClick={() => setFramingKind("court")} title={d.court} />
                  </div>
                  {framingKind === "player" && (
                    <div className="flex flex-wrap gap-1.5">
                      {result.players.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={playerId === p.id}
                          onClick={() => setPlayerId(p.id)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold border-2 ${
                            playerId === p.id ? "text-slate-900" : "border-gray-300 dark:border-slate-600"
                          }`}
                          style={
                            playerId === p.id
                              ? { background: buddyTheme.players[p.id], borderColor: buddyTheme.players[p.id] }
                              : { borderColor: buddyTheme.players[p.id] }
                          }
                        >
                          {names[p.id] ?? p.id}
                        </button>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overlay}
                  disabled={busy}
                  onChange={(e) => setOverlay(e.target.checked)}
                />
                {d.overlay}
              </label>
            </div>

            {/* Preview */}
            <div className="flex flex-col items-center gap-2">
              <canvas
                ref={canvasRef}
                className="rounded-lg bg-black shadow"
                style={
                  plan.height > plan.width
                    ? { height: "min(46vh, 420px)", aspectRatio: `${plan.width} / ${plan.height}` }
                    : { width: "min(100%, 420px)", aspectRatio: `${plan.width} / ${plan.height}` }
                }
              />
              <video
                ref={videoRef}
                src={src}
                muted
                playsInline
                preload="auto"
                className="hidden"
                onSeeked={redraw}
                onLoadedData={(e) => {
                  const v = e.currentTarget;
                  if (Math.abs(v.currentTime - timeRef.current) > 0.02) v.currentTime = timeRef.current;
                  else redraw();
                }}
              />
              {!empty && (
                <input
                  type="range"
                  min={0}
                  max={plan.duration}
                  step={0.05}
                  value={scrub}
                  onChange={(e) => setScrub(Number(e.target.value))}
                  aria-label={t.session.seek}
                  className="w-full max-w-[420px] accent-emerald-600"
                />
              )}
              <div className="text-xs text-gray-500 font-mono">
                {clock(scrub)} / {clock(plan.duration)} · {plan.width}×{plan.height}
              </div>
            </div>
          </div>
        )}

        {!done && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 sticky bottom-0 bg-inherit space-y-2">
            {error && <div className="notification red text-sm">{error}</div>}
            {busy ? (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded">
                    <div
                      className="h-2 rounded bg-emerald-500 transition-all"
                      style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {t.session.exporting} {Math.round((progress ?? 0) * 100)}% · {d.keepOpen}
                  </p>
                </div>
                <button className="button light" onClick={() => abortRef.current?.abort()}>
                  {d.cancel}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500">
                  {empty ? d.nothing : `${d.length} ~${clock(plan.duration)}`}
                </span>
                <button className="button green" disabled={empty} onClick={() => void start()}>
                  <i aria-hidden className="mdi mdi-movie-export-outline mr-1" />
                  {d.start}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
