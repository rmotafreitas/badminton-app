/**
 * Review/correct shots at any time: change type or hitter, mark false hits,
 * jump the video to a shot. Edits are a draft until saved; stats recompute
 * live from the draft.
 */
import { BadgeCheck, Clapperboard, Plus, Undo2, X } from "lucide-react";
import type { AnalysisResult, Corrections, PlayerId, ShotType } from "@/features/rally/engine/types";
import { type ClipScope, clock, stamp } from "@/features/rally/media/clips";
import { useDictionary } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";

/** Native selects (fast with hundreds of rows), dressed like the design system's inputs. */
const nativeSelect =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

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
  /** Export a rally or a shot as a clip. */
  onClip?: (scope: ClipScope) => void;
  readOnly?: boolean;
}

export function ShotReview({ effective, draft, onDraft, names, onSeek, onAdd, onClip, readOnly }: Props) {
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
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus /> {t.session.addShot}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="reviewed-complete" checked={!!draft.reviewedComplete} onCheckedChange={(v) => onDraft({ ...draft, reviewedComplete: v === true })} />
            <Label htmlFor="reviewed-complete" className="text-xs font-normal text-muted-foreground">
              {t.session.reviewedComplete}
            </Label>
          </div>
        </div>
      )}
      {byRally.map(({ rally, shots }, ri) => (
        <div key={rally.id}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.session.rally} {ri + 1} ·{" "}
              <button
                type="button"
                className="tabular font-medium text-primary normal-case hover:underline"
                onClick={() => onSeek?.(Math.max(0, rally.start - 1))}
              >
                {clock(rally.start)}–{clock(rally.end)}
              </button>{" "}
              · {shots.filter((s) => !s.deleted).length} {t.session.shots.toLowerCase()}
            </div>
            {onClip && (
              <Button size="sm" variant="ghost" onClick={() => onClip({ kind: "rallies", ids: [rally.id] })} title={t.exportDialog.clip}>
                <Clapperboard /> {t.exportDialog.clip}
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {shots.map((s) => (
                  <tr
                    key={s.id}
                    className={cn("border-t", s.deleted && "line-through opacity-40")}
                  >
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="tabular text-xs font-medium text-primary hover:underline"
                        onClick={() => onSeek?.(Math.max(0, s.t - 0.6))}
                      >
                        {stamp(s.t)}
                      </button>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        disabled={readOnly || s.deleted}
                        value={s.hitter ?? ""}
                        onChange={(e) => setShot(s.id, { hitter: (e.target.value || null) as PlayerId | null })}
                        className={nativeSelect}
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
                        className={nativeSelect}
                        aria-label={t.session.type}
                      >
                        {TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t.shotTypes[ty]}
                          </option>
                        ))}
                      </select>
                      {s.typeConfidence === "low" && !s.reviewed && (
                        <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">({t.session.low})</span>
                      )}
                    </td>
                    <td className="tabular py-1.5 pr-2 text-right text-xs whitespace-nowrap">
                      {s.speedKmh !== null && s.speedConfidence !== "low"
                        ? `~${s.speedKmh} km/h`
                        : s.avgSpeedKmh !== null
                          ? `~${s.avgSpeedKmh} km/h*`
                          : "—"}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        {s.reviewed && <BadgeCheck className="mr-1 size-4 text-primary" aria-label={t.session.reviewed} />}
                        {onClip && !s.deleted && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            onClick={() => onClip({ kind: "shot", id: s.id })}
                            title={t.exportDialog.clip}
                            aria-label={`${t.exportDialog.clip} ${stamp(s.t)}`}
                          >
                            <Clapperboard />
                          </Button>
                        )}
                        {!readOnly && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            onClick={() => setShot(s.id, { deleted: !s.deleted })}
                            title={s.deleted ? t.session.restore : t.session.remove}
                            aria-label={s.deleted ? t.session.restore : t.session.remove}
                          >
                            {s.deleted ? <Undo2 /> : <X />}
                          </Button>
                        )}
                      </div>
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
