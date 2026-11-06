import Elysia, { t } from "elysia";
import type { RallySessionController } from "@/presentation/controllers/RallySessionController";
import { requireRoles } from "@/presentation/middleware/auth.guard";
import type { JwtService } from "@/application/jwt/JwtService";

const tags = ["Rally Analysis"];
const Format = t.Union([t.Literal("singles"), t.Literal("doubles"), t.Literal("practice")]);

/** Cron-only maintenance (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export const rallyMaintenanceRoutes = (ctrl: RallySessionController) =>
  new Elysia({ prefix: "/rally-sessions/maintenance" }).get(
    "/purge-videos",
    async ({ headers, set }) => {
      const res = await ctrl.purge(headers.authorization, process.env.CRON_SECRET);
      set.status = res.status;
      return res;
    },
    { detail: { tags, summary: "Delete expired review videos (cron)" } },
  );

export const rallySessionRoutes = (ctrl: RallySessionController, jwtService: JwtService) =>
  new Elysia({ prefix: "/rally-sessions" })
    .derive(requireRoles(jwtService, "PLAYER", "COACH", "CLUB_ADMIN", "SYSTEM_ADMIN"))
    .post("/", ({ currentUser, body }) => ctrl.create(currentUser, body), {
      body: t.Object({
        clientId: t.String({ minLength: 8, maxLength: 64 }),
        title: t.Optional(t.Union([t.String({ maxLength: 120 }), t.Null()])),
        recordedAt: t.String(),
        durationS: t.Number({ minimum: 0 }),
        gameId: t.Optional(t.Union([t.String(), t.Null()])),
        trainingDate: t.Optional(t.Union([t.String(), t.Null()])),
      }),
      detail: { tags, summary: "Create a session (idempotent on clientId)" },
    })
    .get("/", ({ currentUser }) => ctrl.list(currentUser), {
      detail: { tags, summary: "Sessions I own or play in" },
    })
    .get("/usage", ({ currentUser }) => ctrl.usage(currentUser), {
      detail: { tags, summary: "My video storage usage" },
    })
    .get("/game/:gameId", ({ currentUser, params }) => ctrl.listForGame(currentUser, params.gameId), {
      detail: { tags, summary: "Sessions linked to a game" },
    })
    .get("/profile/:userId", ({ currentUser, params }) => ctrl.profile(currentUser, params.userId), {
      detail: { tags, summary: "Analysed sessions a user played in (profile stats)" },
    })
    .get("/:id", ({ currentUser, params }) => ctrl.get(currentUser, params.id), {
      detail: { tags, summary: "Get a session" },
    })
    .patch("/:id", ({ currentUser, params, body }) => ctrl.update(currentUser, params.id, body), {
      body: t.Object({
        title: t.Optional(t.Union([t.String({ maxLength: 120 }), t.Null()])),
        format: t.Optional(t.Union([Format, t.Null()])),
        gameId: t.Optional(t.Union([t.String(), t.Null()])),
        trainingDate: t.Optional(t.Union([t.String(), t.Null()])),
        participants: t.Optional(
          t.Array(t.Object({ playerId: t.String(), userId: t.String() }), { maxItems: 6 }),
        ),
        pinned: t.Optional(t.Boolean()),
        corrections: t.Optional(t.Any()),
        shareForTraining: t.Optional(t.Boolean()),
      }),
      detail: { tags, summary: "Update links, players, corrections, pin" },
    })
    .delete("/:id/participants/me", ({ currentUser, params }) => ctrl.leave(currentUser, params.id), {
      detail: { tags, summary: "Remove myself from a session" },
    })
    .delete("/:id", ({ currentUser, params }) => ctrl.delete(currentUser, params.id), {
      detail: { tags, summary: "Delete a session and its files" },
    })
    .post(
      "/:id/video-upload",
      ({ currentUser, params, body }) => ctrl.requestVideoUpload(currentUser, params.id, body),
      {
        body: t.Object({ bytes: t.Number({ minimum: 1 }), contentType: t.String() }),
        detail: { tags, summary: "Presigned URL to upload the review video" },
      },
    )
    .post(
      "/:id/video-complete",
      ({ currentUser, params, body }) => ctrl.completeVideoUpload(currentUser, params.id, body),
      {
        body: t.Object({ key: t.String(), bytes: t.Number({ minimum: 1 }) }),
        detail: { tags, summary: "Confirm the video upload" },
      },
    )
    .get("/:id/video-url", ({ currentUser, params }) => ctrl.videoUrl(currentUser, params.id), {
      detail: { tags, summary: "Presigned URL to stream the review video" },
    })
    .post("/:id/lock", ({ currentUser, params, body }) => ctrl.acquireLock(currentUser, params.id, body), {
      body: t.Object({ deviceId: t.String({ minLength: 8, maxLength: 64 }) }),
      detail: { tags, summary: "Take/renew the analysis lock" },
    })
    .post("/:id/unlock", ({ currentUser, params, body }) => ctrl.releaseLock(currentUser, params.id, body), {
      body: t.Object({ deviceId: t.String(), failed: t.Optional(t.Boolean()) }),
      detail: { tags, summary: "Release the analysis lock" },
    })
    .post("/:id/result-upload", ({ currentUser, params }) => ctrl.requestResultUpload(currentUser, params.id), {
      detail: { tags, summary: "Presigned URL to upload the full analysis" },
    })
    .post("/:id/result", ({ currentUser, params, body }) => ctrl.submitResult(currentUser, params.id, body), {
      body: t.Object({
        summary: t.Any(),
        format: Format,
        resultKey: t.Optional(t.Union([t.String(), t.Null()])),
        deviceId: t.String(),
      }),
      detail: { tags, summary: "Store the analysis summary" },
    })
    .get("/:id/result-url", ({ currentUser, params }) => ctrl.resultUrl(currentUser, params.id), {
      detail: { tags, summary: "Presigned URL to download the full analysis" },
    });
