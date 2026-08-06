import Elysia, { t } from "elysia";
import type { TrainingSessionReviewController } from "@/presentation/controllers/TrainingSessionReviewController";
import { requireRoles } from "@/presentation/middleware/auth.guard";
import type { JwtService } from "@/application/jwt/JwtService";

export const trainingReviewRoutes = (
  ctrl: TrainingSessionReviewController,
  jwtService: JwtService,
) =>
  new Elysia({ prefix: "/training-reviews" })
    .derive(
      requireRoles(jwtService, "PLAYER", "COACH", "CLUB_ADMIN", "SYSTEM_ADMIN"),
    )

    .put(
      "/",
      ({ currentUser, body }) => ctrl.upsertReview(currentUser, body),
      {
        body: t.Object({
          date: t.String(),
          effort: t.Number({ minimum: 1, maximum: 10 }),
          note: t.Optional(t.Union([t.String(), t.Null()])),
        }),
        detail: {
          tags: ["Training Reviews"],
          summary: "Create or update a training session review",
        },
      },
    )

    .get(
      "/me",
      ({ currentUser, query }) =>
        ctrl.getMyReviews(currentUser, query.from, query.to),
      {
        query: t.Object({
          from: t.Optional(t.String()),
          to: t.Optional(t.String()),
        }),
        detail: {
          tags: ["Training Reviews"],
          summary: "Get my training session reviews",
        },
      },
    )

    .get(
      "/me/:date",
      ({ currentUser, params }) => ctrl.getReviewByDate(currentUser, params.date),
      {
        detail: {
          tags: ["Training Reviews"],
          summary: "Get review for a specific date",
        },
      },
    )

    .delete(
      "/:reviewId",
      ({ currentUser, params }) =>
        ctrl.deleteReview(currentUser, params.reviewId),
      {
        detail: {
          tags: ["Training Reviews"],
          summary: "Delete a training session review",
        },
      },
    );
