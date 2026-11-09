import {
  AddMemberBodySchema,
  AssignClubBodySchema,
  ClubDetailSchema,
  ClubFormSchema,
  ClubListSchema,
  ClubSchema,
  CreateClubFormSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  MemberParamsSchema,
  MemberRolesResponseSchema,
  SetMemberRolesBodySchema,
  UserSummarySchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { type Authentication, toUpload } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentClub, presentClubDetail, presentUserSummary } from "@/modules/presenters";

const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 422: ErrorResponseSchema };

const clubInput = async (form: z.infer<typeof ClubFormSchema>) => ({
  name: form.name,
  location: form.location === undefined ? undefined : form.location || null,
  picture: await toUpload(form.picture),
  banner: await toUpload(form.banner),
});

export function clubRoutes(auth: Authentication, deps: ApiDeps) {
  return new Elysia({ name: "module.clubs", prefix: "/clubs" })
    .use(auth)
    .get("/", async ({ actor }) => (await deps.listClubs.execute({ actor })).map(presentClub), {
      auth: true,
      response: { 200: ClubListSchema, ...errors },
    })
    .post(
      "/",
      async ({ actor, body }) => {
        const input = await clubInput(body);
        return presentClub(await deps.createClub.execute({ actor, input: { ...input, name: body.name } }));
      },
      { auth: true, body: CreateClubFormSchema, response: { 200: ClubSchema, ...errors } },
    )
    .post(
      "/assignments",
      async ({ actor, body, status }) => {
        await deps.assignUserToClub.execute({ actor, userId: body.userId, clubId: body.clubId });
        return status(204, undefined);
      },
      { auth: true, body: AssignClubBodySchema, response: { 204: z.void(), ...errors } },
    )
    .get("/:id", async ({ actor, params }) => presentClubDetail(await deps.getClub.execute({ actor, clubId: params.id })), {
      auth: true,
      params: IdParamsSchema,
      response: { 200: ClubDetailSchema, ...errors },
    })
    .patch(
      "/:id",
      async ({ actor, params, body }) =>
        presentClub(await deps.updateClub.execute({ actor, clubId: params.id, input: await clubInput(body) })),
      { auth: true, params: IdParamsSchema, body: ClubFormSchema, response: { 200: ClubSchema, ...errors } },
    )
    .delete(
      "/:id",
      async ({ actor, params, status }) => {
        await deps.deleteClub.execute({ actor, clubId: params.id });
        return status(204, undefined);
      },
      { auth: true, params: IdParamsSchema, response: { 204: z.void(), ...errors } },
    )
    // Membership: club admins manage their own club, system admins any club.
    .post(
      "/:id/members",
      async ({ actor, params, body }) => presentUserSummary(await deps.addClubMember.execute({ actor, clubId: params.id, input: body })),
      { auth: true, params: IdParamsSchema, body: AddMemberBodySchema, response: { 200: UserSummarySchema, ...errors } },
    )
    .put(
      "/:id/members/:userId/roles",
      async ({ actor, params, body }) => ({
        roles: await deps.setMemberRoles.execute({ actor, clubId: params.id, userId: params.userId, roles: body.roles }),
      }),
      { auth: true, params: MemberParamsSchema, body: SetMemberRolesBodySchema, response: { 200: MemberRolesResponseSchema, ...errors } },
    )
    .delete(
      "/:id/members/:userId",
      async ({ actor, params, status }) => {
        await deps.removeClubMember.execute({ actor, clubId: params.id, userId: params.userId });
        return status(204, undefined);
      },
      { auth: true, params: MemberParamsSchema, response: { 204: z.void(), ...errors } },
    );
}
