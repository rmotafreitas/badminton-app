import { cn } from "@/shared/lib/utils";
import { tick } from "@/shared/lib/haptics";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { checkScore } from "./score";

const ALL = Array.from({ length: 31 }, (_, i) => i);

/**
 * Pick a score with one tap — no keyboard (sweaty hands, mid-game). 21 is the big default; when the other team's
 * score is already known, the scores that make a valid game are highlighted and the rest dimmed.
 */
export function ScorePicker({
  open,
  onOpenChange,
  title,
  value,
  other,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: number | null;
  /** The other team's score in this set, if already entered. */
  other: number | null;
  onPick: (score: number) => void;
}) {
  const t = useDictionary().ui.games;
  // Any target works (clubs play to 11, 15 or 21): a score is valid if it makes a legal finished set with the other.
  const valid = (score: number) => other === null || checkScore(score, other) === null;
  const pick = (score: number) => {
    tick();
    onPick(score);
  };
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={title} description={t.pickScoreHint}>
      <div className="space-y-3">
        <button
          type="button"
          aria-label={t.quick21}
          onClick={() => pick(21)}
          className={cn(
            "tap-target flex h-16 w-full items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-sm active:scale-[0.98]",
            !valid(21) && "opacity-40",
          )}
        >
          21
        </button>
        <div className="grid grid-cols-6 gap-2">
          {ALL.map((score) => (
            <button
              key={score}
              type="button"
              aria-label={`${score}`}
              aria-pressed={value === score}
              onClick={() => pick(score)}
              className={cn(
                "tap-target tabular flex h-14 items-center justify-center rounded-xl border text-lg font-semibold transition active:scale-95",
                value === score ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                !valid(score) && value !== score && "opacity-35",
              )}
            >
              {score}
            </button>
          ))}
        </div>
      </div>
    </ResponsiveSheet>
  );
}
