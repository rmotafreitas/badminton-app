/**
 * Review/correct shots at any time: change type or hitter, mark false hits,
 * jump the video to a shot. Edits are a draft until saved; stats recompute
 * live from the draft.
 */
import { useDictionary } from "@/i18n";
import type { AnalysisResult, Corrections, PlayerId, ShotType } from "../engine/types";

const TYPES: ShotType[] = ["serve", "clear", "smash", "drop", "drive", "lift", "net", "other"];

interface Props {
  /** Result with the draft already applied. */
  effective: AnalysisResult;
  draft: Corrections;
  onDraft: (c: Corrections) => void;
  names: Partial<Record<PlayerId, string>>;
  onSeek?: (t: number) => void;
  /** Add a hit the engine missed, at the player's current time. */
  onAdd?: () => void;
  readOnly?: boolean;
}

export function ShotReview({ effective, draft, onDraft, names, onSeek, onAdd, readOnly }: Props) {
  const t = useDictionary().rally;
  const setShot = (id: string, fix: NonNullable<Corrections["shots"]>[string]) =>
    onDraft({ ...draft, shots: { ...draft.shots, [id]: { ...draft.shots?.[id], ...fix } } });

  const byRally = effective.rallies.map((r) => ({
    rally: r,
    shots: effective.shots.filter((s) => s.rallyId === r.id),
  }));

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {onAdd && (
            <button className="button small light" onClick={onAdd}>
              <i className="mdi mdi-plus mr-1" />
              {t.session.addShot}
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={!!draft.reviewedComplete}
              onChange={(e) => onDraft({ ...draft, reviewedComplete: e.target.checked })}
            />
            {t.session.reviewedComplete}
          </label>
        </div>
      )}
      {byRally.map(({ rally, shots }, ri) => (
        <div key={rally.id}>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {t.session.rally} {ri + 1} · {shots.filter((s) => !s.deleted).length}{" "}
            {t.session.shots.toLowerCase()}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {shots.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-t border-gray-100 dark:border-slate-800 ${s.deleted ? "opacity-40 line-through" : ""}`}
                  >
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      <button
                        className="font-mono text-xs text-sky-600 hover:underline"
                        onClick={() => onSeek?.(Math.max(0, s.t - 0.6))}
                      >
                        {s.t.toFixed(1)}s
                      </button>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        disabled={readOnly || s.deleted}
                        value={s.hitter ?? ""}
                        onChange={(e) => setShot(s.id, { hitter: (e.target.value || null) as PlayerId | null })}
                        className="bg-transparent border rounded px-1 py-0.5 text-sm"
                        aria-label={t.session.hitter}
                      >
                        <option value="">—</option>
                        {effective.players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {names[p.id] ?? p.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        disabled={readOnly || s.deleted}
                        value={s.type}
                        onChange={(e) => setShot(s.id, { type: e.target.value as ShotType })}
                        className="bg-transparent border rounded px-1 py-0.5 text-sm"
                        aria-label={t.session.type}
                      >
                        {TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t.shotTypes[ty]}
                          </option>
                        ))}
                      </select>
                      {s.typeConfidence === "low" && !s.reviewed && (
                        <span className="ml-1 text-[10px] text-amber-600">({t.session.low})</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-right font-mono text-xs">
                      {s.speedKmh !== null && s.speedConfidence !== "low"
                        ? `~${s.speedKmh} km/h`
                        : s.avgSpeedKmh !== null
                          ? `~${s.avgSpeedKmh} km/h*`
                          : "—"}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {s.reviewed && <i className="mdi mdi-check-decagram text-emerald-600 mr-1" title={t.session.reviewed} />}
                      {!readOnly && (
                        <button
                          className="button small light"
                          onClick={() => setShot(s.id, { deleted: !s.deleted })}
                          title={s.deleted ? t.session.restore : t.session.remove}
                        >
                          <i className={`mdi ${s.deleted ? "mdi-undo" : "mdi-close"}`} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
