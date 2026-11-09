import { createFileRoute } from "@tanstack/react-router";
import { routeData } from "@/app/loaders";
import { useSessionUser } from "@/features/auth";
import { ProfilePage, profileQuery } from "@/features/profiles";

export const Route = createFileRoute("/_app/profile/$userId")({
  loader: ({ context: { queryClient, api }, params }) => routeData(queryClient.ensureQueryData(profileQuery(api, params.userId))),
  component: PlayerProfile,
});

function PlayerProfile() {
  const { userId } = Route.useParams();
  return <ProfilePage key={userId} userId={userId} viewer={useSessionUser()} />;
}
