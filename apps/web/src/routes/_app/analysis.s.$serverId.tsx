import { createFileRoute } from "@tanstack/react-router";
import SessionPage from "@/features/rally/ui/SessionPage";

/** A session recorded on another device (or already uploaded from this one). */
export const Route = createFileRoute("/_app/analysis/s/$serverId")({ component: CloudSession });

function CloudSession() {
  const { serverId } = Route.useParams();
  return <SessionPage key={serverId} serverId={serverId} />;
}
