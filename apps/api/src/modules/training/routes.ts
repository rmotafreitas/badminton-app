import {
  CalendarDay,
  ErrorResponseSchema,
  IdParamsSchema,
  SaveTrainingReviewBodySchema,
  TrainingDaySchema,
  TrainingRangeQuerySchema,
  TrainingReviewListSchema,
  TrainingReviewSchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Authentication } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentReview } from "@/modules/presenters";

const errors = { 401: ErrorResponseSchema, 404: ErrorResponseSchema, 422: ErrorResponseSchema };

export function trainingRoutes(auth: Authentication, deps: ApiDeps) {
  return new Elysia({ name: "module.training", prefix: "/training-reviews" })
    .use(auth)
    .put("/", async ({ actor, body }) => presentReview(await deps.saveTrainingReview.execute({ actor, input: body })), {
      auth: true,
      body: SaveTrainingReviewBodySchema,
      response: { 200: TrainingReviewSchema, ...errors },
    })
    .get(
      "/",
      async ({ actor, query }) => (await deps.listMyTrainingReviews.execute({ actor, ...query })).map(presentReview),
      { auth: true, query: TrainingRangeQuerySchema, response: { 200: TrainingReviewListSchema, ...errors } },
    )
    .get(
      "/day/:date",
      async ({ actor, params }) => {
        const review = await deps.getMyTrainingReview.execute({ actor, date: params.date });
        return { review: review ? presentReview(review) : null };
      },
      { auth: true, params: z.object({ date: CalendarDay }), response: { 200: TrainingDaySchema, ...errors } },
    )
    .delete(
      "/:id",
      async ({ actor, params, status }) => {
        await deps.deleteTrainingReview.execute({ actor, reviewId: params.id });
        return status(204, undefined);
      },
      { auth: true, params: IdParamsSchema, response: { 204: z.void(), ...errors } },
    );
}
