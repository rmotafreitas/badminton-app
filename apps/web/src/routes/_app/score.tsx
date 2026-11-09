import { createFileRoute } from "@tanstack/react-router";
import { useSessionUser } from "@/features/auth";
import { LiveScorePage } from "@/features/games";

/** Full-screen live scoring, used on court between rallies. */
export const Route = createFileRoute("/_app/score")({ component: () => <LiveScorePage user={useSessionUser()} /> });
