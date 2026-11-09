import {
  CreateRallySessionBodySchema,
  ErrorResponseSchema,
  IdParamsSchema,
  IdSchema,
  LockBodySchema,
  LockSchema,
  ProfileRallySessionListSchema,
  RallySessionListSchema,
  RallySessionSchema,
  RallyUsageSchema,
  ResultUploadSchema,
  ResultUrlSchema,
  SubmitResultBodySchema,
  UnlockBodySchema,
  UpdateRallySessionBodySchema,
  VideoCompleteBodySchema,
  VideoUploadBodySchema,
  VideoUploadSchema,
  VideoUrlSchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Authentication } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentRallySession } from "@/modules/presenters";

const errors = {
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  413: ErrorResponseSchema,
  422: ErrorResponseSchema,
};
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Rally Analysis: sessions recorded and analysed on-device; videos and full results in object storage. */
export function rallyRoutes(auth: Authentication, deps: ApiDeps) {
  const full = (s: Parameters<typeof presentRallySession>[0]) => presentRallySession(s, "full", deps.clock.now());
  return (
    new Elysia({ name: "module.rally", prefix: "/rally-sessions" })
      // Vercel Cron only (Authorization: Bearer $CRON_SECRET). Without a secret configured it always answers 401.
      .get(
        "/maintenance/purge-videos",
        async ({ headers, status }) => {
          if (!deps.cronSecret || headers.authorization !== `Bearer ${deps.cronSecret}`) {
            return status(401, { code: "unauthenticated", message: "Cron only.", requestId: "cron" });
          }
          return { deleted: await deps.purgeExpiredVideos.execute() };
        },
        { response: { 200: z.object({ deleted: z.number() }), 401: ErrorResponseSchema } },
      )
      .use(auth)
      .post("/", async ({ actor, body }) => full(await deps.createRallySession.execute({ actor, input: body })), {
        auth: true,
        body: CreateRallySessionBodySchema,
        response: { 200: RallySessionSchema, ...errors },
      })
      .get("/", async ({ actor }) => (await deps.listMyRallySessions.execute({ actor })).map(full), {
        auth: true,
        response: { 200: RallySessionListSchema, ...errors },
      })
      .get("/usage", ({ actor }) => deps.getRallyUsage.execute({ actor }), {
        auth: true,
        response: { 200: RallyUsageSchema, ...errors },
      })
      .get(
        "/game/:gameId",
        async ({ actor, params }) =>
          (await deps.listGameRallySessions.execute({ actor, gameId: params.gameId })).map(({ session, access }) =>
            presentRallySession(session, access, deps.clock.now()),
          ),
        { auth: true, params: z.object({ gameId: IdSchema }), response: { 200: RallySessionListSchema, ...errors } },
      )
      .get(
        "/profile/:userId",
        async ({ actor, params }) =>
          (await deps.listProfileRallySessions.execute({ actor, userId: params.userId })).map(({ session, playerId }) => ({
            id: session.id,
            recordedAt: session.recordedAt.toISOString(),
            durationS: session.durationS,
            format: session.format,
            playerId,
            summary: session.summary ?? null,
          })),
        { auth: true, params: z.object({ userId: IdSchema }), response: { 200: ProfileRallySessionListSchema, ...errors } },
      )
      .get(
        "/:id",
        async ({ actor, params }) => {
          const { session, access } = await deps.getRallySession.execute({ actor, id: params.id });
          return presentRallySession(session, access, deps.clock.now());
        },
        { auth: true, params: IdParamsSchema, response: { 200: RallySessionSchema, ...errors } },
      )
      .patch(
        "/:id",
        async ({ actor, params, body }) => full(await deps.updateRallySession.execute({ actor, id: params.id, input: body })),
        { auth: true, params: IdParamsSchema, body: UpdateRallySessionBodySchema, response: { 200: RallySessionSchema, ...errors } },
      )
      .delete(
        "/:id/participants/me",
        async ({ actor, params, status }) => {
          await deps.leaveRallySession.execute({ actor, id: params.id });
          return status(204, undefined);
        },
        { auth: true, params: IdParamsSchema, response: { 204: z.void(), ...errors } },
      )
      .delete(
        "/:id",
        async ({ actor, params, status }) => {
          await deps.deleteRallySession.execute({ actor, id: params.id });
          return status(204, undefined);
        },
        { auth: true, params: IdParamsSchema, response: { 204: z.void(), ...errors } },
      )
      .post(
        "/:id/video-upload",
        ({ actor, params, body }) => deps.requestVideoUpload.execute({ actor, id: params.id, ...body }),
        { auth: true, params: IdParamsSchema, body: VideoUploadBodySchema, response: { 200: VideoUploadSchema, ...errors } },
      )
      .post(
        "/:id/video-complete",
        async ({ actor, params, body }) => full(await deps.completeVideoUpload.execute({ actor, id: params.id, ...body })),
        { auth: true, params: IdParamsSchema, body: VideoCompleteBodySchema, response: { 200: RallySessionSchema, ...errors } },
      )
      .get(
        "/:id/video-url",
        async ({ actor, params }) => {
          const { url, expiresAt } = await deps.getVideoUrl.execute({ actor, id: params.id });
          return { url, expiresAt: iso(expiresAt) };
        },
        { auth: true, params: IdParamsSchema, response: { 200: VideoUrlSchema, ...errors } },
      )
      .post(
        "/:id/lock",
        async ({ actor, params, body }) => {
          const lock = await deps.acquireAnalysisLock.execute({ actor, id: params.id, deviceId: body.deviceId });
          return { deviceId: lock.deviceId, until: lock.until.toISOString() };
        },
        { auth: true, params: IdParamsSchema, body: LockBodySchema, response: { 200: LockSchema, ...errors } },
      )
      .post(
        "/:id/unlock",
        async ({ actor, params, body, status }) => {
          await deps.releaseAnalysisLock.execute({ actor, id: params.id, ...body });
          return status(204, undefined);
        },
        { auth: true, params: IdParamsSchema, body: UnlockBodySchema, response: { 204: z.void(), ...errors } },
      )
      .post("/:id/result-upload", ({ actor, params }) => deps.requestResultUpload.execute({ actor, id: params.id }), {
        auth: true,
        params: IdParamsSchema,
        response: { 200: ResultUploadSchema, ...errors },
      })
      .post(
        "/:id/result",
        async ({ actor, params, body }) => full(await deps.submitAnalysisResult.execute({ actor, id: params.id, input: body })),
        { auth: true, params: IdParamsSchema, body: SubmitResultBodySchema, response: { 200: RallySessionSchema, ...errors } },
      )
      .get("/:id/result-url", ({ actor, params }) => deps.getResultUrl.execute({ actor, id: params.id }), {
        auth: true,
        params: IdParamsSchema,
        response: { 200: ResultUrlSchema, ...errors },
      })
  );
}
