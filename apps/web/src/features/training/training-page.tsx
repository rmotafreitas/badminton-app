import type { TrainingReview } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { Page, PageHeader } from "@/shared/components/page-header";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { formatDate, localDay } from "@/shared/lib/format";
import { tick } from "@/shared/lib/haptics";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Textarea } from "@/shared/ui/textarea";
import { deleteReview, invalidateTraining, rememberReview, saveReview, trainingReviewsQuery } from "./api";

/** Effort → a green that deepens with intensity (0 = no session). */
const effortStyle = (effort: number) => (effort === 0 ? undefined : { background: `color-mix(in oklch, var(--primary) ${20 + effort * 8}%, transparent)` });

function EffortCalendar({ reviews, selected, onSelect }: { reviews: TrainingReview[]; selected: string; onSelect: (day: string) => void }) {
  const { lang } = useLanguage();
  const weeks = 16;
  const byDay = useMemo(() => new Map(reviews.map((r) => [r.date, r.effort])), [reviews]);
  const days = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - (weeks - 1) * 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { key: localDay(d), future: d > end, date: d };
    });
  }, []);
  return (
    <div className="pb-1">
      <div className="grid w-full auto-cols-fr grid-flow-col grid-rows-7 gap-1">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            disabled={d.future}
            onClick={() => onSelect(d.key)}
            title={`${formatDate(d.date, lang)}${byDay.get(d.key) ? ` · ${byDay.get(d.key)}/10` : ""}`}
            className={cn(
              "aspect-square w-full max-w-7 justify-self-center rounded-[4px] bg-muted transition-transform hover:scale-110 disabled:invisible",
              d.key === selected && "ring-2 ring-ring ring-offset-1 ring-offset-card",
            )}
            style={effortStyle(byDay.get(d.key) ?? 0)}
          />
        ))}
      </div>
    </div>
  );
}

export function TrainingPage() {
  const dict = useDictionary().ui;
  const t = dict.training;
  const { lang } = useLanguage();
  const { api, queryClient } = useAppContext();
  const reviews = useQuery(trainingReviewsQuery(api));
  const [date, setDate] = useState(localDay());
  const isCustomDay = date !== localDay() && date !== localDay(new Date(Date.now() - 86_400_000));
  const existing = reviews.data?.find((r) => r.date === date);
  const [effort, setEffort] = useState(5);
  const [note, setNote] = useState("");

  // Picking a day that already has a review edits it.
  useEffect(() => {
    setEffort(existing?.effort ?? 5);
    setNote(existing?.note ?? "");
  }, [existing]);

  const save = useMutation({
    mutationFn: () => saveReview(api, { date, effort, note: note.trim() || null }),
    onSuccess: (review) => {
      toast.success(t.saved);
      rememberReview(queryClient, review);
      void invalidateTraining(queryClient);
    },
  });
  // Deleting is optimistic: the review disappears at once and comes back only if the server refuses.
  const remove = useMutation({
    mutationFn: (id: string) => deleteReview(api, id),
    onMutate: async (id: string) => {
      const key = trainingReviewsQuery(api).queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (reviews) => reviews?.filter((r) => r.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(trainingReviewsQuery(api).queryKey, context.previous);
      toast.error(error.message);
    },
    onSuccess: () => toast.success(t.deleted),
    onSettled: () => void invalidateTraining(queryClient),
  });

  const last30 = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const recent = (reviews.data ?? []).filter((r) => r.date >= localDay(from));
    return { count: recent.length, avg: recent.length ? (recent.reduce((s, r) => s + r.effort, 0) / recent.length).toFixed(1) : "—" };
  }, [reviews.data]);

  return (
    <Page>
      <PageHeader title={t.title} description={t.subtitle} />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.logTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Field>
                <FieldLabel htmlFor="training-date">{t.date}</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: dict.common.today, day: localDay() },
                    { label: t.yesterday, day: localDay(new Date(Date.now() - 86_400_000)) },
                  ].map((chip) => (
                    <Button
                      key={chip.day}
                      type="button"
                      variant={date === chip.day ? "default" : "outline"}
                      className="tap-target h-11 rounded-full px-5"
                      onClick={() => setDate(chip.day)}
                    >
                      {chip.label}
                    </Button>
                  ))}
                  <label
                    className={cn(
                      "tap-target relative inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-medium",
                      isCustomDay ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                    )}
                  >
                    <CalendarDays className="size-4" aria-hidden />
                    {isCustomDay ? formatDate(`${date}T12:00:00`, lang, { day: "numeric", month: "short" }) : t.otherDay}
                    <input
                      id="training-date"
                      type="date"
                      aria-label={t.date}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                      value={date}
                      max={localDay()}
                      onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                      onChange={(e) => e.target.value && setDate(e.target.value)}
                    />
                  </label>
                </div>
              </Field>
              <Field>
                <div className="flex items-end justify-between">
                  <FieldLabel>{t.effort}</FieldLabel>
                  <span className="tabular text-right">
                    <span className="text-3xl font-semibold text-primary">{effort}</span>
                    <span className="text-sm text-muted-foreground">/10 · {t.levels[effort]}</span>
                  </span>
                </div>
                {/* Ten big buttons instead of a slider: one tap, even with sweaty fingers. */}
                <div role="radiogroup" aria-label={t.effort} className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={effort === level}
                      aria-label={`${level} · ${t.levels[level]}`}
                      onClick={() => {
                        tick();
                        setEffort(level);
                      }}
                      className={cn(
                        "tap-target tabular flex h-14 items-center justify-center rounded-xl border text-xl font-bold transition active:scale-95",
                        effort === level ? "border-transparent text-primary-foreground shadow-sm" : "bg-card",
                      )}
                      style={effort === level ? { background: `color-mix(in oklch, var(--primary) ${55 + level * 4.5}%, oklch(0.75 0.15 85))` } : undefined}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <FieldDescription>{t.effortHint}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="training-note">
                  {t.note} <span className="font-normal text-muted-foreground">({dict.common.optional})</span>
                </FieldLabel>
                <Textarea id="training-note" rows={3} maxLength={1000} placeholder={t.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button type="submit" className="h-12 w-full text-base" disabled={save.isPending}>
                {save.isPending && <Spinner />} {dict.common.save}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t.last30}</CardTitle>
            <CardDescription>{t.calendarHint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/60 p-4">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.sessions}</div>
                <div className="tabular text-3xl font-semibold">{last30.count}</div>
              </div>
              <div className="rounded-xl bg-muted/60 p-4">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.averageEffort}</div>
                <div className="tabular text-3xl font-semibold">{last30.avg}</div>
              </div>
            </div>
            {reviews.data ? <EffortCalendar reviews={reviews.data} selected={date} onSelect={setDate} /> : <Skeleton className="h-36" />}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.history}</h2>
        {reviews.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : !reviews.data?.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck />
              </EmptyMedia>
              <EmptyTitle>{t.empty}</EmptyTitle>
              <EmptyDescription>{t.subtitle}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="py-2">
            <CardContent className="divide-y px-2">
              {reviews.data.slice(0, 30).map((r) => (
                <div key={r.id} className="group flex items-center gap-4 rounded-lg px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setDate(r.date)}
                    className="tabular flex size-11 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-primary-foreground"
                    style={{ background: `color-mix(in oklch, var(--primary) ${45 + r.effort * 5.5}%, var(--muted))` }}
                  >
                    {r.effort}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium capitalize">{formatDate(`${r.date}T12:00:00`, lang, { weekday: "long", day: "numeric", month: "short" })}</div>
                    <div className="truncate text-sm text-muted-foreground">{r.note || t.levels[r.effort]}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-destructive"
                    aria-label={dict.common.delete}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(r.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </Page>
  );
}
