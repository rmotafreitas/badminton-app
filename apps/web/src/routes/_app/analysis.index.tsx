import { createFileRoute } from "@tanstack/react-router";
import SessionsPage from "@/features/rally/ui/SessionsPage";

export const Route = createFileRoute("/_app/analysis/")({ component: SessionsPage });
