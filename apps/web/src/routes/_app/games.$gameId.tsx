import { createFileRoute } from "@tanstack/react-router";
import { routeData } from "@/app/loaders";
import { useSessionUser } from "@/features/auth";
import { GameDetailPage, gameQuery } from "@/features/games";
import { GameRallySessions } from "@/features/rally";

export const Route = createFileRoute("/_app/games/$gameId")({
  loader: ({ context: { queryClient, api }, params }) => routeData(queryClient.ensureQueryData(gameQuery(api, params.gameId, queryClient))),
  component: GameDetail,
});

function GameDetail() {
  const { gameId } = Route.useParams();
  return <GameDetailPage gameId={gameId} user={useSessionUser()} slot={<GameRallySessions gameId={gameId} />} />;
}
