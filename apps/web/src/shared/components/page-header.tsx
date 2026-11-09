import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The content column of every page inside the app shell. */
export function Page({ children, className, wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-6 px-4 py-6 md:px-8 md:py-8", wide ? "max-w-7xl" : "max-w-6xl", className)}>{children}</div>;
}
