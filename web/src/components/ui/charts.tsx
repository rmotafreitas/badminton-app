import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { useDictionary } from "@/i18n";
import { useLanguage } from "@/i18n";

/* ── Colors ──────────────────────────────────────────────────────────── */

const COLORS = {
  win: "hsl(var(--success))",
  loss: "hsl(var(--destructive))",
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--accent))",
  muted: "hsl(var(--muted))",
  mutedFg: "hsl(var(--muted-foreground))",
  chart2: "hsl(var(--chart-2))",
  chart3: "hsl(var(--chart-3))",
};

/* ── Win/Loss Donut ──────────────────────────────────────────────────── */

export function WinLossDonut({
  wins,
  losses,
  size = 180,
}: {
  wins: number;
  losses: number;
  size?: number;
}) {
  const dict = useDictionary().profile;
  const total = wins + losses;
  const data =
    total > 0
      ? [
          { name: dict.wins, value: wins, color: COLORS.win },
          { name: dict.losses, value: losses, color: COLORS.loss },
        ]
      : [
          { name: dict.noGames, value: 1, color: COLORS.muted },
        ];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={total > 0 ? 3 : 0}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl sm:text-3xl font-bold text-foreground">
          {total > 0 ? Math.round((wins / total) * 100) : 0}%
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {dict.winRate}
        </span>
      </div>
    </div>
  );
}

/* ── ELO Progression Line ────────────────────────────────────────────── */

export function EloLineChart({
  singles,
  doubles,
  height = 200,
}: {
  singles: { label: string; elo: number }[];
  doubles: { label: string; elo: number }[];
  height?: number;
}) {
  const dict = useDictionary().profile;
  const gamesDict = useDictionary().games;

  // Merge the two series onto a shared set of x-axis labels (dates). Each
  // series only has a point when a game of that type was played on that date.
  const labels = Array.from(
    new Set([...singles.map((d) => d.label), ...doubles.map((d) => d.label)]),
  );
  const singlesMap = new Map(singles.map((d) => [d.label, d.elo]));
  const doublesMap = new Map(doubles.map((d) => [d.label, d.elo]));
  const data = labels.map((label) => ({
    label,
    singles: singlesMap.get(label) ?? null,
    doubles: doublesMap.get(label) ?? null,
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground/70 py-12">
        {dict.noGames}
      </div>
    );
  }

  const allElos = [...singles, ...doubles].map((d) => d.elo);
  const minElo = allElos.length > 0 ? Math.min(...allElos) : 0;
  const maxElo = allElos.length > 0 ? Math.max(...allElos) : 400;
  const padding = Math.max(20, Math.round((maxElo - minElo) * 0.15));

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: COLORS.mutedFg }}
            interval="preserveStartEnd"
            minTickGap={24}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: COLORS.mutedFg }}
            domain={[minElo - padding, maxElo + padding]}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Line
            type="monotone"
            dataKey="singles"
            name={gamesDict.singles}
            stroke={COLORS.primary}
            strokeWidth={2.5}
            connectNulls
            dot={{ r: 2.5, fill: COLORS.primary, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="doubles"
            name={gamesDict.doubles}
            stroke={COLORS.accent}
            strokeWidth={2.5}
            connectNulls
            dot={{ r: 2.5, fill: COLORS.accent, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLORS.primary }} />
          {gamesDict.singles}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLORS.accent }} />
          {gamesDict.doubles}
        </span>
      </div>
    </div>
  );
}

/* ── Monthly Activity Bar Chart ──────────────────────────────────────── */

export function ActivityBarChart({
  data,
  height = 200,
  showSplit = false,
}: {
  data: { monthShort: string; games: number; wins?: number; losses?: number }[];
  height?: number;
  showSplit?: boolean;
}) {
  const dict = useDictionary().profile;
  const { lang } = useLanguage();
  const locale = lang === "pt-PT" ? "pt-PT" : "en-US";
  const monthLabel = locale === "pt-PT" ? "Mês" : "Month";

  if (data.length === 0 || data.every((d) => d.games === 0)) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground/70 py-12">
        {dict.noGames}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="monthShort"
          tick={{ fontSize: 10, fill: COLORS.mutedFg }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: COLORS.mutedFg }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
        />
        {showSplit ? (
          <>
            <Bar dataKey="wins" stackId="a" fill={COLORS.win} radius={[0, 0, 0, 0]} name={dict.wins} />
            <Bar dataKey="losses" stackId="a" fill={COLORS.loss} radius={[4, 4, 0, 0]} name={dict.losses} />
          </>
        ) : (
          <Bar dataKey="games" fill={COLORS.primary} radius={[4, 4, 0, 0]} name={monthLabel} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── ELO Radial Gauge ────────────────────────────────────────────────── */

export function EloGauge({
  elo,
  min = 0,
  max = 1000,
  size = 160,
}: {
  elo: number;
  min?: number;
  max?: number;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(1, (elo - min) / (max - min)));
  const data = [{ name: "ELO", value: pct * 100, fill: COLORS.primary }];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={90}
          endAngle={-270}
          innerRadius="72%"
          outerRadius="100%"
          barSize={10}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={8}
            background={{ fill: "hsl(var(--muted))" }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl sm:text-3xl font-bold text-foreground">{elo}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">ELO</span>
      </div>
    </div>
  );
}

/* ── Game Type Split Bar ─────────────────────────────────────────────── */

export function TypeSplitChart({
  singles,
  doubles,
  height = 160,
}: {
  singles: number;
  doubles: number;
  height?: number;
}) {
  const dict = useDictionary().games;
  const data = [
    { name: dict.singles, value: singles, fill: COLORS.primary },
    { name: dict.doubles, value: doubles, fill: COLORS.accent },
  ];

  if (singles + doubles === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground/70 py-8">
        {dict.noGamesFound}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: COLORS.mutedFg }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} name={dict.type}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Recent Form Pills ───────────────────────────────────────────────── */

export function RecentFormPills({
  form,
}: {
  form: { result: "W" | "L"; date: string; opponent: string; type: string }[];
}) {
  const dict = useDictionary().games;
  if (form.length === 0) {
    return (
      <div className="text-sm text-muted-foreground/70 py-4 text-center">
        {dict.noGamesFound}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {form.map((f, i) => (
        <span
          key={i}
          title={`${f.opponent} — ${f.date}`}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
            f.result === "W"
              ? "bg-success/15 text-success"
              : "bg-destructive/15 text-destructive"
          }`}
        >
          {f.result}
        </span>
      ))}
    </div>
  );
}

/* ── Top Players Bar (Dashboard) ─────────────────────────────────────── */

export function TopPlayersChart({
  data,
  height = 200,
}: {
  data: { name: string; games: number; wins: number; winRate: number }[];
  height?: number;
}) {
  const dict = useDictionary().dashboard;
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground/70 py-12">
        {dict.noRecentGames}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: COLORS.mutedFg }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
        />
        <Bar dataKey="games" radius={[0, 4, 4, 0]} fill={COLORS.primary} name={dict.totalGames} />
      </BarChart>
    </ResponsiveContainer>
  );
}
