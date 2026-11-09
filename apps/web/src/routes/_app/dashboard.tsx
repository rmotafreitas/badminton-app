import { createFileRoute } from "@tanstack/react-router";
import { useSessionUser } from "@/features/auth";
import { clubQuery } from "@/features/clubs";
import { DashboardPage } from "@/features/dashboard";
import { clubGamesQuery, myGamesQuery } from "@/features/games";
import { trainingReviewsQuery } from "@/features/training";

export const Route = createFileRoute("/_app/dashboard")({
  // Start every request at once; each card renders as soon as its own data is there (or from the persisted cache).
  loader: ({ context: { queryClient, api, user } }) => {
    void queryClient.prefetchQuery(myGamesQuery(api));
    void queryClient.prefetchQuery(trainingReviewsQuery(api));
    if (user.clubId) {
      void queryClient.prefetchQuery(clubQuery(api, user.clubId));
      void queryClient.prefetchQuery(clubGamesQuery(api, user.clubId));
    }
  },
  component: () => <DashboardPage user={useSessionUser()} />,
});
