import { createFileRoute } from "@tanstack/react-router";
import { routeData } from "@/app/loaders";
import { useSessionUser } from "@/features/auth";
import { ProfilePage, profileQuery } from "@/features/profiles";

export const Route = createFileRoute("/_app/profile/")({
  loader: ({ context: { queryClient, api, user } }) => routeData(queryClient.ensureQueryData(profileQuery(api, user.id))),
  component: MyProfile,
});

function MyProfile() {
  const user = useSessionUser();
  return <ProfilePage userId={user.id} viewer={user} />;
}
