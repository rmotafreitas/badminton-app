import { createFileRoute } from "@tanstack/react-router";
import RecordPage from "@/features/rally/ui/RecordPage";

export const Route = createFileRoute("/_app/analysis/record")({ component: RecordPage });
