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
  data: { label: string; elo: number }[];
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

function ChartSkeleton({ height }: { height: number }) {
  return <div style={{ height }}><Skeleton className="h-full w-full" /></div>;
}

function makeLazyChart<P extends BaseChartProps>(
  factory: () => Promise<{ default: ComponentType<P> }>,
  fallbackHeight = 170,
): ComponentType<P> {
  const LazyComponent = lazy(factory);
  return (props: P) => (
    <Suspense fallback={<ChartSkeleton height={props.height ?? fallbackHeight} />}>
      <LazyComponent {...props} />
    </Suspense>
  );
}

const loadCharts = () => import("@/components/ui/charts");

export const WinLossDonut = makeLazyChart<WinLossDonutProps>(() =>
  loadCharts().then((m) => ({ default: m.WinLossDonut })),
);
export const EloLineChart = makeLazyChart<EloLineChartProps>(() =>
  loadCharts().then((m) => ({ default: m.EloLineChart })),
);
export const ActivityBarChart = makeLazyChart<ActivityBarChartProps>(() =>
  loadCharts().then((m) => ({ default: m.ActivityBarChart })),
);
export const EloGauge = makeLazyChart<EloGaugeProps>(() =>
  loadCharts().then((m) => ({ default: m.EloGauge })),
);
export const TypeSplitChart = makeLazyChart<TypeSplitChartProps>(() =>
  loadCharts().then((m) => ({ default: m.TypeSplitChart })),
);
export const RecentFormPills = makeLazyChart<RecentFormPillsProps>(() =>
  loadCharts().then((m) => ({ default: m.RecentFormPills })),
);
export const TopPlayersChart = makeLazyChart<TopPlayersChartProps>(() =>
  loadCharts().then((m) => ({ default: m.TopPlayersChart })),
);
