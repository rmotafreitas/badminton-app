import { cn } from "@/lib/utils";

/** A single shimmering placeholder block. */
export function Skeleton({
  className,
  rounded = "rounded",
}: {
  className?: string;
  rounded?: string;
}) {
  return <div className={cn("skeleton", rounded, className)} aria-hidden />;
}

/** One or more stacked text-line skeletons. */
export function SkeletonText({
  lines = 3,
  className,
  lineClassName,
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full", lineClassName)}
        />
      ))}
    </div>
  );
}

/** Skeleton rows for a table. */
export function SkeletonRows({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} aria-hidden>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <Skeleton className="h-4 max-w-[160px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Stat/widget card skeleton. */
export function WidgetSkeleton({ label = true }: { label?: boolean }) {
  return (
    <div className="card">
      <div className="card-content">
        <div className="flex items-center justify-between">
          <div className="widget-label space-y-2">
            {label && <Skeleton className="h-4 w-28" />}
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-12 w-12 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Profile masthead + detail skeleton. */
export function ProfileSkeleton() {
  return (
    <div aria-hidden>
      <div className="relative min-h-[230px] sm:min-h-[280px]">
        <Skeleton className="h-[140px] sm:h-[200px] w-full" rounded="rounded-none" />
        <div className="border-b border-border px-3 sm:px-6 pb-4 sm:pb-5">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-5">
            <Skeleton className="w-[90px] h-[90px] sm:w-[120px] sm:h-[120px] rounded-full -mt-[45px] sm:-mt-[60px] sm:ml-3" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      </div>
      <div className="card mt-4">
        <div className="card-content px-5 sm:px-8 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-page centered loader with a label. */
export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background">
      <div className="skeleton-circle" aria-hidden />
      {label && (
        <p className="text-sm text-muted-foreground animate-pulse">{label}</p>
      )}
    </div>
  );
}
