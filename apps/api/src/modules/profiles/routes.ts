import { ErrorResponseSchema, IdSchema, ProfileSchema, UpdateProfileFormSchema } from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { type Authentication, toUpload } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentProfile } from "@/modules/presenters";

const errors = { 401: ErrorResponseSchema, 404: ErrorResponseSchema, 422: ErrorResponseSchema };
const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v || null);

export function profileRoutes(auth: Authentication, deps: ApiDeps) {
  return new Elysia({ name: "module.profiles", prefix: "/profiles" })
    .use(auth)
    .get("/me", async ({ actor }) => presentProfile(await deps.getProfile.execute({ actor, userId: actor.userId })), {
      auth: true,
      response: { 200: ProfileSchema, ...errors },
    })
    .patch(
      "/me",
      async ({ actor, body }) => {
        const input = {
          name: body.name,
          birthday: blankToNull(body.birthday),
          sex: blankToNull(body.sex),
          bio: blankToNull(body.bio),
          photo: await toUpload(body.photo),
          banner: await toUpload(body.banner),
        };
        return presentProfile(await deps.updateMyProfile.execute({ actor, input }));
      },
      { auth: true, body: UpdateProfileFormSchema, response: { 200: ProfileSchema, ...errors } },
    )
    .get("/:userId", async ({ actor, params }) => presentProfile(await deps.getProfile.execute({ actor, userId: params.userId })), {
      auth: true,
      params: z.object({ userId: IdSchema }),
      response: { 200: ProfileSchema, ...errors },
    });
}
