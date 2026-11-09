import { createFileRoute } from "@tanstack/react-router";
import SessionPage from "@/features/rally/ui/SessionPage";

/** A session on this device, by its client id. */
export const Route = createFileRoute("/_app/analysis/$key")({ component: LocalSession });

function LocalSession() {
  const { key } = Route.useParams();
  return <SessionPage key={key} clientKey={key} />;
}
