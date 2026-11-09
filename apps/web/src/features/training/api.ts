import type { TrainingReview } from "@bb/contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Api, unwrap } from "@/app/api";
import { staleTime } from "@/app/query-client";

export const trainingKeys = { all: ["training"] as const, list: () => ["training", "list"] as const };

export const trainingReviewsQuery = (api: Api) =>
  queryOptions({
    queryKey: trainingKeys.list(),
    queryFn: async () => unwrap(await api["training-reviews"].get({ query: {} })) as TrainingReview[],
    staleTime: staleTime.own,
    meta: { persist: true },
  });

export const saveReview = async (api: Api, body: { date: string; effort: number; note?: string | null }) =>
  unwrap(await api["training-reviews"].put(body)) as TrainingReview;

export const deleteReview = async (api: Api, id: string) => unwrap(await api["training-reviews"]({ id }).delete());

/** The saved review replaces the one for its day (or joins the list), before any refetch. */
export const rememberReview = (queryClient: QueryClient, review: TrainingReview) =>
  queryClient.setQueryData<TrainingReview[]>(trainingKeys.list(), (reviews) =>
    reviews ? [review, ...reviews.filter((r) => r.id !== review.id && r.date !== review.date)].sort((a, b) => b.date.localeCompare(a.date)) : reviews,
  );

export const invalidateTraining = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: trainingKeys.all });
