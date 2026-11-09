import {
  ClubRegistrationListSchema,
  CompleteSignedUploadBodySchema,
  ErrorResponseSchema,
  IdParamsSchema,
  PrepareRegistrationBodySchema,
  RegistrationFormSchema,
  RegistrationSchema,
  RegistrationSheetSchema,
  SaveDetailsBodySchema,
  SignedFileUrlSchema,
  SignedUploadBodySchema,
  SignedUploadSchema,
  UpdateRegistrationBodySchema,
  UserParamsSchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Authentication } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentClubRegistrations, presentRegistration, presentRegistrationSheet } from "./presenters";

const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 422: ErrorResponseSchema };

/**
 * Season registration. `/me/...` is the member's own form; `/members/:userId/...` is their club admin acting for them;
 * `/clubs/:id/...` is the club's list and form text; `/:id/...` is one registration (the club's side, the signed scan).
 */
export function registrationRoutes(auth: Authentication, deps: ApiDeps) {
  const sheet = async (actor: Parameters<typeof deps.getRegistrationSheet.execute>[0]["actor"], userId?: string) =>
    presentRegistrationSheet(await deps.getRegistrationSheet.execute({ actor, userId }));
  return new Elysia({ name: "module.registrations", prefix: "/registrations" })
    .use(auth)
    .get("/me", ({ actor }) => sheet(actor), { auth: true, response: { 200: RegistrationSheetSchema, ...errors } })
    .put(
      "/me/details",
      async ({ actor, body }) => {
        await deps.saveMemberDetails.execute({ actor, input: body });
        return sheet(actor);
      },
      { auth: true, body: SaveDetailsBodySchema, response: { 200: RegistrationSheetSchema, ...errors } },
    )
    .delete(
      "/me/details",
      async ({ actor, status }) => {
        await deps.eraseMyDetails.execute({ actor });
        return status(204, undefined);
      },
      { auth: true, response: { 204: z.void(), ...errors } },
    )
    .post("/me/prepare", async ({ actor, body }) => presentRegistration(await deps.prepareRegistration.execute({ actor, categories: body.categories })), {
      auth: true,
      body: PrepareRegistrationBodySchema,
      response: { 200: RegistrationSchema, ...errors },
    })
    .get("/members/:userId", ({ actor, params }) => sheet(actor, params.userId), {
      auth: true,
      params: UserParamsSchema,
      response: { 200: RegistrationSheetSchema, ...errors },
    })
    .put(
      "/members/:userId/details",
      async ({ actor, params, body }) => {
        await deps.saveMemberDetails.execute({ actor, userId: params.userId, input: body });
        return sheet(actor, params.userId);
      },
      { auth: true, params: UserParamsSchema, body: SaveDetailsBodySchema, response: { 200: RegistrationSheetSchema, ...errors } },
    )
    .post(
      "/members/:userId/prepare",
      async ({ actor, params, body }) =>
        presentRegistration(await deps.prepareRegistration.execute({ actor, userId: params.userId, categories: body.categories })),
      { auth: true, params: UserParamsSchema, body: PrepareRegistrationBodySchema, response: { 200: RegistrationSchema, ...errors } },
    )
    .get("/clubs/:id", async ({ actor, params }) => presentClubRegistrations(await deps.listClubRegistrations.execute({ actor, clubId: params.id })), {
      auth: true,
      params: IdParamsSchema,
      response: { 200: ClubRegistrationListSchema, ...errors },
    })
    .get("/clubs/:id/form", ({ actor, params }) => deps.getRegistrationForm.execute({ actor, clubId: params.id }), {
      auth: true,
      params: IdParamsSchema,
      response: { 200: RegistrationFormSchema, ...errors },
    })
    .put("/clubs/:id/form", ({ actor, params, body }) => deps.updateRegistrationForm.execute({ actor, clubId: params.id, form: body }), {
      auth: true,
      params: IdParamsSchema,
      body: RegistrationFormSchema,
      response: { 200: RegistrationFormSchema, ...errors },
    })
    .patch("/:id", async ({ actor, params, body }) => presentRegistration(await deps.updateRegistration.execute({ actor, id: params.id, changes: body })), {
      auth: true,
      params: IdParamsSchema,
      body: UpdateRegistrationBodySchema,
      response: { 200: RegistrationSchema, ...errors },
    })
    .delete(
      "/:id",
      async ({ actor, params, status }) => {
        await deps.deleteRegistration.execute({ actor, id: params.id });
        return status(204, undefined);
      },
      { auth: true, params: IdParamsSchema, response: { 204: z.void(), ...errors } },
    )
    .post("/:id/signed/upload", ({ actor, params, body }) => deps.requestSignedUpload.execute({ actor, id: params.id, ...body }), {
      auth: true,
      params: IdParamsSchema,
      body: SignedUploadBodySchema,
      response: { 200: SignedUploadSchema, ...errors },
    })
    .post(
      "/:id/signed/complete",
      async ({ actor, params, body }) => presentRegistration(await deps.completeSignedUpload.execute({ actor, id: params.id, ...body })),
      { auth: true, params: IdParamsSchema, body: CompleteSignedUploadBodySchema, response: { 200: RegistrationSchema, ...errors } },
    )
    .get("/:id/signed", ({ actor, params }) => deps.getSignedFileUrl.execute({ actor, id: params.id }), {
      auth: true,
      params: IdParamsSchema,
      response: { 200: SignedFileUrlSchema, ...errors },
    })
    .delete("/:id/signed", async ({ actor, params }) => presentRegistration(await deps.removeSignedFile.execute({ actor, id: params.id })), {
      auth: true,
      params: IdParamsSchema,
      response: { 200: RegistrationSchema, ...errors },
    });
}
