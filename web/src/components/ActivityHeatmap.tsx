import { useMemo, useState, useRef, useLayoutEffect, useEffect } from "react";
import type { Game } from "@/core/domain/game";

interface DayCell {
  date: string;
  count: number;
  wins: number;
  level: number;
}

interface ActivityHeatmapProps {
  games: Game[];
  userId: string;
  lang: "pt-PT" | "en-US";
  labels: {
    gamesCount: string;
    gamesCountPlural: string;
    winsShort: string;
    lossesShort: string;
    legendLess: string;
    legendMore: string;
  };
}

const WEEK_COUNT = 53;
const WEEK_DAYS = 7;

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateKey(key: string): Date {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(d: Date, weekStart: number): Date {
  const day = d.getDay();
  const diff = (day - weekStart + 7) % 7;
  const start = new Date(d);
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function gameDateKey(playedAt: string | Date): string {
  const d = typeof playedAt === "string" ? new Date(playedAt) : playedAt;
  return toDateKey(d);
}

export function ActivityHeatmap({ games, userId, lang, labels }: ActivityHeatmapProps) {
  const weekStart = lang === "pt-PT" ? 1 : 0; // Monday / Sunday
  const locale = lang === "pt-PT" ? "pt-PT" : "en-US";

  const weeks = useMemo(() => {
    const today = new Date();
    const endOfCurrentWeek = addDays(startOfWeek(today, weekStart), WEEK_DAYS - 1);
    const startDate = addDays(endOfCurrentWeek, -(WEEK_COUNT * WEEK_DAYS - 1));

    const counts = new Map<string, { count: number; wins: number }>();
    for (let i = 0; i < WEEK_COUNT * WEEK_DAYS; i++) {
      counts.set(toDateKey(addDays(startDate, i)), { count: 0, wins: 0 });
    }

    for (const g of games) {
      const key = gameDateKey(g.playedAt);
      const entry = counts.get(key);
      if (!entry) continue;
      entry.count++;
      const isTeam1 = g.team1PlayerIds.includes(userId);
      if (g.winner === (isTeam1 ? "team1" : "team2")) {
        entry.wins++;
      }
    }

    const maxCount = Math.max(1, ...Array.from(counts.values()).map((v) => v.count));
    const days: DayCell[] = Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, wins }]) => ({
        date,
        count,
        wins,
        level: count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4)),
      }));

    const result: DayCell[][] = [];
    for (let w = 0; w < WEEK_COUNT; w++) {
      result.push(days.slice(w * WEEK_DAYS, (w + 1) * WEEK_DAYS));
    }
    return result;
  }, [games, userId, weekStart]);

  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    weeks.forEach((week, col) => {
      for (const day of week) {
        const d = fromDateKey(day.date);
        if (d.getDate() === 1) {
          labels.push({
            col,
            label: d.toLocaleDateString(locale, { month: "short" }).replace(/\.$/, ""),
          });
          break;
        }
      }
    });
    return labels;
  }, [weeks, locale]);

  const weekDayLabels = useMemo(() => {
    // Show a compact label for Mon/Wed/Fri (or their localized equivalents).
    const sample = weeks[0] ?? [];
    return sample
      .map((day, index) => ({
        index,
        label: fromDateKey(day.date).toLocaleDateString(locale, { weekday: "narrow" }),
      }))
      .filter(({ index }) => index % 2 === 1);
  }, [weeks, locale]);

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    day: DayCell;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 });
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      setTooltipSize({ width: rect.width, height: rect.height });
    }
  }, [tooltip?.day]);

  useEffect(() => {
    if (!tooltip) {
      setTooltipPos(null);
      return;
    }
    const margin = 10;
    let left = tooltip.x + margin;
    let top = tooltip.y - tooltipSize.height - margin;
    if (left + tooltipSize.width > window.innerWidth) {
      left = tooltip.x - tooltipSize.width - margin;
    }
    if (top < 0) {
      top = tooltip.y + margin;
    }
    if (left < 0) {
      left = margin;
    }
    setTooltipPos({ left, top });
  }, [tooltip, tooltipSize]);

  function colorClass(level: number): string {
    switch (level) {
      case 0:
        return "bg-muted";
      case 1:
        return "bg-success/30";
      case 2:
        return "bg-success/50";
      case 3:
        return "bg-success";
      case 4:
        return "bg-success/90";
      default:
        return "bg-success/90";
    }
  }

  const handleEnter = (day: DayCell) => (e: React.MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY, day });
  };

  const handleMove = (day: DayCell) => (e: React.MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY, day });
  };

  const handleLeave = () => setTooltip(null);

  const firstDay = weeks[0]?.[0];
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-2">
        <div
          className="flex justify-between text-[10px] text-muted-foreground mb-1"
          style={{ minWidth: `${WEEK_COUNT * 14 + 40}px` }}
        >
          <span>{firstDay ? fromDateKey(firstDay.date).getFullYear() : ""}</span>
          <span>{currentYear}</span>
        </div>
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `auto repeat(${WEEK_COUNT}, minmax(10px, 1fr))`,
            minWidth: `${WEEK_COUNT * 14 + 40}px`,
          }}
        >
          {/* Month labels row */}
          <div />
          {weeks.map((_, col) => {
            const month = monthLabels.find((m) => m.col === col);
            return (
              <div key={`month-${col}`} className="text-[9px] text-muted-foreground/70 leading-none h-3 truncate">
                {month?.label ?? ""}
              </div>
            );
          })}

          {/* Weekday labels + cells */}
          {Array.from({ length: WEEK_DAYS }).map((_, row) => (
            <div key={`row-${row}`} className="contents">
              <div className="flex items-center justify-end pr-1">
                {weekDayLabels.find((l) => l.index === row)?.label && (
                  <span className="text-[9px] text-muted-foreground/70 leading-none">
                    {weekDayLabels.find((l) => l.index === row)?.label}
                  </span>
                )}
              </div>
              {weeks.map((week, col) => {
                const day = week[row];
                const isFuture = day.date > todayKey;
                const hasGames = day.count > 0 && !isFuture;
                return (
                  <div
                    key={`cell-${col}-${row}`}
                    className={`group relative aspect-square rounded-sm ${colorClass(day.level)} ${
                      hasGames ? "cursor-pointer" : ""
                    }`}
                    onMouseEnter={isFuture ? undefined : handleEnter(day)}
                    onMouseMove={isFuture ? undefined : handleMove(day)}
                    onMouseLeave={isFuture ? undefined : handleLeave}
                    aria-label={isFuture ? undefined : day.date}
                    aria-hidden={isFuture}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-muted-foreground">
        <span>{labels.legendLess}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div key={`legend-${level}`} className={`w-3 h-3 rounded-sm ${colorClass(level)}`} />
        ))}
        <span>{labels.legendMore}</span>
      </div>

      {/* Fixed tooltip rendered outside the scroll container so it cannot be clipped */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-[200] pointer-events-none bg-foreground text-primary-foreground text-xs rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{
            left: tooltipPos?.left ?? tooltip.x + 10,
            top: tooltipPos?.top ?? tooltip.y - 10,
            visibility: tooltipSize.width > 0 && tooltipPos ? "visible" : "hidden",
          }}
        >
          <p className="font-semibold">
            {fromDateKey(tooltip.day.date).toLocaleDateString(locale, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className="text-muted-foreground/80 mt-0.5">
            {tooltip.day.count}{" "}
            {tooltip.day.count === 1 ? labels.gamesCount : labels.gamesCountPlural} · {tooltip.day.wins}
            {labels.winsShort} {tooltip.day.count - tooltip.day.wins}
            {labels.lossesShort}
          </p>
        </div>
      )}
    </div>
  );
}
