import type { RatingHistory } from "@bb/contracts";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/shared/ui/chart";

/** Singles and doubles ratings after each game, on one time axis. */
export function RatingChart({ history }: { history: RatingHistory }) {
  const dict = useDictionary().ui;
  const { lang } = useLanguage();
  const config = {
    singles: { label: dict.common.singles, color: "var(--chart-1)" },
    doubles: { label: dict.common.doubles, color: "var(--chart-3)" },
  } satisfies ChartConfig;
  // One point per game (evenly spaced: a busy week shouldn't look like a cliff), carrying the other discipline's
  // last rating forward so both lines stay continuous.
  const data = useMemo(() => {
    const points = [
      ...history.singles.map((p) => ({ t: new Date(p.playedAt).getTime(), singles: p.rating })),
      ...history.doubles.map((p) => ({ t: new Date(p.playedAt).getTime(), doubles: p.rating })),
    ].sort((a, b) => a.t - b.t);
    let singles: number | undefined;
    let doubles: number | undefined;
    return points.map((p, i) => {
      singles = "singles" in p ? p.singles : singles;
      doubles = "doubles" in p ? p.doubles : doubles;
      return { i, t: p.t, singles, doubles };
    });
  }, [history]);
  const values = data.flatMap((d) => [d.singles, d.doubles]).filter((v): v is number => v !== undefined);
  const min = Math.floor((Math.min(...values) - 15) / 10) * 10;
  const max = Math.ceil((Math.max(...values) + 15) / 10) * 10;
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
        <defs>
          {(["singles", "doubles"] as const).map((key) => (
            <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.25} />
              <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="i"
          tickLine={false}
          axisLine={false}
          minTickGap={48}
          tickFormatter={(i: number) => (data[i] ? new Date(data[i].t).toLocaleDateString(lang, { month: "short", day: "numeric" }) : "")}
        />
        <YAxis domain={[min, max]} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(_, payload) => new Date(payload[0]?.payload.t).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })} />}
        />
        <Area dataKey="singles" type="monotone" stroke="var(--color-singles)" strokeWidth={2} fill="url(#fill-singles)" connectNulls dot={false} animationDuration={500} />
        <Area dataKey="doubles" type="monotone" stroke="var(--color-doubles)" strokeWidth={2} fill="url(#fill-doubles)" connectNulls dot={false} animationDuration={500} />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

export function MonthlyChart({ monthly }: { monthly: { key: string; date: Date; wins: number; losses: number }[] }) {
  const dict = useDictionary().ui;
  const { lang } = useLanguage();
  const config = {
    wins: { label: dict.common.wins, color: "var(--win)" },
    losses: { label: dict.common.losses, color: "var(--loss)" },
  } satisfies ChartConfig;
  const data = monthly.map((m) => ({ ...m, label: m.date.toLocaleDateString(lang, { month: "short" }) }));
  return (
    <ChartContainer config={config} className="aspect-auto h-52 w-full">
      <BarChart data={data} margin={{ left: -20, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="wins" stackId="g" fill="var(--color-wins)" radius={[0, 0, 4, 4]} />
        <Bar dataKey="losses" stackId="g" fill="var(--color-losses)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
