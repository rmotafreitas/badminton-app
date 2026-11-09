import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { CircleAlert, Compass, Lock } from "lucide-react";
import { isApiError } from "@/app/api";
import { useDictionary } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Skeleton } from "@/shared/ui/skeleton";

/** Shown while a route's loader waits longer than `pendingMs`: the page's rough shape, not a spinner. */
export function PendingFallback() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export function ErrorFallback({ error }: ErrorComponentProps) {
  const dict = useDictionary().ui;
  const router = useRouter();
  const { reset } = useQueryErrorResetBoundary();
  const forbidden = isApiError(error, 403);
  return (
    <Empty className="m-4 min-h-[60vh] md:m-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">{forbidden ? <Lock /> : <CircleAlert />}</EmptyMedia>
        <EmptyTitle>{forbidden ? dict.errors.forbiddenTitle : dict.errors.title}</EmptyTitle>
        <EmptyDescription>{forbidden ? dict.errors.forbiddenBody : dict.errors.body}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        {!forbidden && (
          <Button
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            {dict.common.retry}
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link to="/dashboard">{dict.errors.goHome}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function NotFoundFallback() {
  const dict = useDictionary().ui;
  return (
    <Empty className="m-4 min-h-[60vh] md:m-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Compass />
        </EmptyMedia>
        <EmptyTitle>{dict.errors.notFoundTitle}</EmptyTitle>
        <EmptyDescription>{dict.errors.notFoundBody}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link to="/dashboard">{dict.errors.goHome}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
