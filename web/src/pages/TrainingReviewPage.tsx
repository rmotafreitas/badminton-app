import { useCallback, useEffect, useRef, useState } from "react";
import { useTrainingReviewService } from "@/di/container";
import { useDictionary } from "@/i18n";
import { useQuery, useMutation, invalidateQueries } from "@/hooks/useQuery";
import { WidgetSkeleton } from "@/components/ui";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const EFFORT_CONFIG = [
  { face: "😴", color: "#34C759", labelKey: "veryLight" },
  { face: "😴", color: "#34C759", labelKey: "veryLight" },
  { face: "🙂", color: "#30D5C8", labelKey: "light" },
  { face: "🙂", color: "#30D5C8", labelKey: "light" },
  { face: "😐", color: "#FFCC00", labelKey: "moderate" },
  { face: "😐", color: "#FFCC00", labelKey: "moderate" },
  { face: "😤", color: "#FF9500", labelKey: "hard" },
  { face: "😤", color: "#FF9500", labelKey: "hard" },
  { face: "🥵", color: "#FF3B30", labelKey: "maximum" },
  { face: "🥵", color: "#FF3B30", labelKey: "maximum" },
] as const;

function getEffortConfig(value: number) {
  return EFFORT_CONFIG[value - 1] ?? EFFORT_CONFIG[9];
}

/**
 * Apple Health/Fitness-style effort selector. Every value from 1–10 is its
 * own rounded pill, heights ascending within each cluster of 2–3. Unselected
 * pills are pale and blend together; the selected value is simply that same
 * pill filled with the accent color — there's no separate overlay, so it
 * never floats or misaligns relative to its neighbors.
 */
function EffortSelector({
  value,
  color,
  onChange,
  t,
}: {
  value: number;
  color: string;
  onChange: (v: number) => void;
  t: ReturnType<typeof useDictionary>["trainingReview"];
}) {
  const clusters = [
    { values: [1, 2, 3], maxHeight: 55 },
    { values: [4, 5, 6], maxHeight: 68 },
    { values: [7, 8], maxHeight: 81 },
    { values: [9, 10], maxHeight: 94 },
  ];

  return (
    <div
      className="flex items-end justify-center"
      style={{ gap: 9 }}
      role="radiogroup"
      aria-label={t.rateLabel}
    >
      {clusters.map((cluster, ci) => {
        const n = cluster.values.length;
        return (
          <div key={ci} className="flex items-end" style={{ gap: 3 }}>
            {cluster.values.map((effort, i) => {
              const selected = value === effort;
              const heightFraction = n > 1 ? 0.55 + (0.45 * i) / (n - 1) : 1;
              const barHeight = cluster.maxHeight * heightFraction;

              return (
                <button
                  key={effort}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${t.effortAriaLabel} ${effort} / 10`}
                  onClick={() => onChange(effort)}
                  className="relative flex flex-col items-center justify-end border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
                  style={{ width: 16, height: cluster.maxHeight }}
                >
                  <span
                    className="block w-full rounded-full"
                    style={{
                      height: barHeight,
                      backgroundColor: selected ? color : "#F2F2F2",
                    }}
                  />
                  <span
                    className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: selected ? "#FFFFFF" : "#C7C7CC" }}
                  />
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function TrainingReviewPage() {
  const service = useTrainingReviewService();
  const dict = useDictionary();
  const t = dict.trainingReview;
  const locale = navigator.language || "en-US";

  const currentDate = todayStr();

  const { data: review, isLoading } = useQuery(
    ["training-review", currentDate],
    () => service.getReviewByDate(currentDate),
    { enabled: true },
  );

  const [effortValue, setEffortValue] = useState(5);
  const [noteValue, setNoteValue] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (review && !initialized.current) {
      setEffortValue(review.effort);
      setNoteValue(review.note ?? "");
      initialized.current = true;
    }
  }, [review]);

  const upsertMutation = useMutation(
    (params: { date: string; effort: number; note?: string | null }) =>
      service.upsertReview(params),
    {
      onSuccess: () => invalidateQueries(["training-review"]),
    },
  );

  const deleteMutation = useMutation(
    (reviewId: string) => service.deleteReview(reviewId),
    {
      onSuccess: () => {
        invalidateQueries(["training-review"]);
        setEffortValue(5);
        setNoteValue("");
        initialized.current = false;
      },
    },
  );

  const handleSave = useCallback(() => {
    upsertMutation.mutate({
      date: currentDate,
      effort: effortValue,
      note: noteValue || null,
    });
  }, [effortValue, noteValue, currentDate, upsertMutation]);

  const handleDelete = useCallback(() => {
    if (review && confirm(t.deleteConfirm)) {
      deleteMutation.mutate(review.id);
    }
  }, [review, deleteMutation, t.deleteConfirm]);

  const config = getEffortConfig(effortValue);

  if (isLoading) {
    return (
      <section className="section main-section">
        <WidgetSkeleton />
      </section>
    );
  }

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">{t.title}</h1>
        </div>
      </section>

      <section className="section main-section">
        <div className="card">
          <header className="card-header">
            <p className="card-header-title">
              <span className="icon"><i className="mdi mdi-clipboard-text-clock"></i></span>
              {formatDate(currentDate, locale)}
            </p>
          </header>
          <div className="card-content">
            <div
              className="flex flex-col items-center text-center bg-white py-14 sm:py-20"
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
              }}
            >
              {/* Emoji, score, status, subtitle, graph — one tight vertical group */}
              <span
                className="text-5xl leading-none select-none"
                role="img"
                aria-label={t.labels[config.labelKey as keyof typeof t.labels]}
              >
                {config.face}
              </span>

              <div className="flex items-baseline gap-1 mt-3">
                <span
                  className="text-[64px] font-bold leading-none tabular-nums"
                  style={{ color: config.color }}
                >
                  {effortValue}
                </span>
                <span className="text-2xl font-medium tabular-nums" style={{ color: "#8E8E93" }}>
                  /10
                </span>
              </div>

              <p
                className="text-lg font-medium leading-none mt-2"
                style={{ color: config.color }}
              >
                {t.labels[config.labelKey as keyof typeof t.labels]}
              </p>

              <p className="text-xs font-normal mt-1.5" style={{ color: "#8E8E93" }}>
                {t.rateLabel}
              </p>

              <div className="mt-7">
                <EffortSelector
                  value={effortValue}
                  color={config.color}
                  onChange={setEffortValue}
                  t={t}
                />
              </div>
            </div>

            <hr />

            {/* Notes */}
            <div className="field">
              <label className="label">{t.noteLabel}</label>
              <div className="control">
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder={t.notePlaceholder}
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                />
              </div>
            </div>

            <hr />

            {/* Actions */}
            <div className="field grouped">
              <div className="control">
                <button
                  className="button green"
                  onClick={handleSave}
                  disabled={upsertMutation.isPending || deleteMutation.isPending}
                >
                  <span className="icon"><i className="mdi mdi-check"></i></span>
                  <span>{upsertMutation.isPending ? t.saving : t.save}</span>
                </button>
              </div>
              {review && (
                <div className="control">
                  <button
                    className="button red"
                    onClick={handleDelete}
                    disabled={upsertMutation.isPending || deleteMutation.isPending}
                  >
                    <span className="icon"><i className="mdi mdi-trash-can"></i></span>
                    <span>{deleteMutation.isPending ? t.deleting : t.delete}</span>
                  </button>
                </div>
              )}
            </div>

            {review && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                {t.lastSaved}: {new Date(review.updatedAt).toLocaleString(locale)}
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}