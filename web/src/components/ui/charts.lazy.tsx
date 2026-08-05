import { lazy, Suspense } from "react";
import type { ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lazy-loaded chart components — recharts is ~250KB, so we code-split it.
 * Each chart renders a skeleton placeholder while the library loads.
 */

interface BaseChartProps {
  height?: number;
  size?: number;
}

interface WinLossDonutProps extends BaseChartProps {
  wins: number;
  losses: number;
}

interface EloLineChartProps extends BaseChartProps {
  singles: { label: string; elo: number }[];
  doubles: { label: string; elo: number }[];
}

interface ActivityBarChartProps extends BaseChartProps {
  data: { monthShort: string; games: number; wins?: number; losses?: number }[];
  showSplit?: boolean;
}

interface EloGaugeProps extends BaseChartProps {
  elo: number;
  min?: number;
  max?: number;
}

interface TypeSplitChartProps extends BaseChartProps {
  singles: number;
  doubles: number;
}

interface RecentFormPillsProps extends BaseChartProps {
  form: { result: "W" | "L"; date: string; opponent: string; type: string }[];
}

interface TopPlayersChartProps extends BaseChartProps {
  data: { name: string; games: number; wins: number; winRate: number }[];
}

function ChartSkeleton({
  height,
  shape,
  size,
}: {
  height: number;
  shape: "circle" | "bar";
  size?: number;
}) {
  if (shape === "circle") {
    const s = size ?? height;
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <Skeleton
          className="rounded-full"
          style={{ width: s, height: s }}
        />
      </div>
    );
  }
  return <div style={{ height }}><Skeleton className="h-full w-full" /></div>;
}

function makeLazyChart<P extends BaseChartProps>(
  factory: () => Promise<{ default: ComponentType<P> }>,
  opts: { fallbackHeight?: number; fallbackShape?: "circle" | "bar" } = {},
): ComponentType<P> {
  const { fallbackHeight = 170, fallbackShape = "bar" } = opts;
  const LazyComponent = lazy(factory);
  return (props: P) => (
    <Suspense
      fallback={
        <ChartSkeleton
          height={props.height ?? fallbackHeight}
          shape={fallbackShape}
          size={props.size}
        />
      }
    >
      <LazyComponent {...props} />
    </Suspense>
  );
}

const loadCharts = () => import("@/components/ui/charts");

export const WinLossDonut = makeLazyChart<WinLossDonutProps>(() =>
  loadCharts().then((m) => ({ default: m.WinLossDonut })),
  { fallbackShape: "circle" },
);
export const EloLineChart = makeLazyChart<EloLineChartProps>(() =>
  loadCharts().then((m) => ({ default: m.EloLineChart })),
  { fallbackHeight: 200 },
);
export const ActivityBarChart = makeLazyChart<ActivityBarChartProps>(() =>
  loadCharts().then((m) => ({ default: m.ActivityBarChart })),
  { fallbackHeight: 200 },
);
export const EloGauge = makeLazyChart<EloGaugeProps>(() =>
  loadCharts().then((m) => ({ default: m.EloGauge })),
  { fallbackShape: "circle", fallbackHeight: 130 },
);
export const TypeSplitChart = makeLazyChart<TypeSplitChartProps>(() =>
  loadCharts().then((m) => ({ default: m.TypeSplitChart })),
);
export const RecentFormPills = makeLazyChart<RecentFormPillsProps>(() =>
  loadCharts().then((m) => ({ default: m.RecentFormPills })),
  { fallbackHeight: 40 },
);
export const TopPlayersChart = makeLazyChart<TopPlayersChartProps>(() =>
  loadCharts().then((m) => ({ default: m.TopPlayersChart })),
  { fallbackHeight: 200 },
);
