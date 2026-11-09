import { createFileRoute } from "@tanstack/react-router";
import { TrainingPage, trainingReviewsQuery } from "@/features/training";

export const Route = createFileRoute("/_app/training-review")({
  loader: ({ context: { queryClient, api } }) => void queryClient.prefetchQuery(trainingReviewsQuery(api)),
  component: TrainingPage,
});
