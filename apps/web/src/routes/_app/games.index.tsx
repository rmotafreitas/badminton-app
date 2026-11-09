import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSessionUser } from "@/features/auth";
import { GamesPage } from "@/features/games";

export const Route = createFileRoute("/_app/games/")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => (search.new === true || search.new === "true" ? { new: true } : {}),
  component: Games,
});

function Games() {
  const { new: openNew } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <GamesPage
      user={useSessionUser()}
      openNew={!!openNew}
      onOpenNewChange={(open) => void navigate({ search: open ? { new: true } : {}, replace: true })}
    />
  );
}
