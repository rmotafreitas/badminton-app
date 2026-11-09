import { ErrorResponseSchema, IdSchema } from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { type Authentication, immutableImage } from "@/http";
import type { ApiDeps } from "@/modules/deps";

const Version = z.string().regex(/^[a-z0-9]{6,32}$/i);

/**
 * Images by content version: `/api/media/profiles/:id/photo/:version`. The version is in the URL, so the response
 * is cached by the browser for a year and a changed photo simply gets a new URL. Never in JSON again.
 */
export function mediaRoutes(auth: Authentication, deps: ApiDeps) {
  const serve = async (owner: "profile" | "club", id: string, kind: "photo" | "picture" | "banner", set: { headers: Record<string, unknown> }) => {
    const image = await deps.getImage.execute({ owner, id, kind });
    immutableImage(set);
    return new Response(image.bytes, { headers: { "content-type": image.contentType } });
  };
  return new Elysia({ name: "module.media", prefix: "/media" })
    .use(auth)
    .get("/profiles/:id/:kind/:version", ({ params, set }) => serve("profile", params.id, params.kind, set), {
      auth: true,
      params: z.object({ id: IdSchema, kind: z.enum(["photo", "banner"]), version: Version }),
      response: { 401: ErrorResponseSchema, 404: ErrorResponseSchema },
    })
    .get("/clubs/:id/:kind/:version", ({ params, set }) => serve("club", params.id, params.kind, set), {
      auth: true,
      params: z.object({ id: IdSchema, kind: z.enum(["picture", "banner"]), version: Version }),
      response: { 401: ErrorResponseSchema, 404: ErrorResponseSchema },
    });
}
