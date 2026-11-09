import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const LabPage = lazy(() => import("@/features/rally/lab/LabPage"));

/** Internal on-device benchmark for Rally Analysis. Unlisted, no API calls, cross-origin isolated in dev. */
export const Route = createFileRoute("/lab")({
  component: () => (
    <Suspense fallback={null}>
      <LabPage />
    </Suspense>
  ),
});
