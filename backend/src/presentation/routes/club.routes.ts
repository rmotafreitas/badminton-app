import Elysia, { t } from "elysia";
import type { ClubController } from "@/presentation/controllers/ClubController";
import { requireRoles } from "@/presentation/middleware/auth.guard";
import type { JwtService } from "@/application/jwt/JwtService";

export const clubRoutes = (ctrl: ClubController, jwtService: JwtService) =>
  new Elysia({ prefix: "/clubs" })

    // Only SYSTEM_ADMIN can create clubs or see all clubs
    .group("/admin", (app) =>
      app
        .derive(requireRoles(jwtService, "SYSTEM_ADMIN"))
        .post("/", ({ body }) => ctrl.createClub(body), {
          body: t.Object({
            name: t.String(),
            location: t.Optional(t.String()),
            profilePicture: t.Optional(t.File()),
            banner: t.Optional(t.File()),
          }),
          detail: { tags: ["Clubs"], summary: "Create a new club" },
        })
        .get("/", () => ctrl.getAllClubs(), {
          detail: { tags: ["Clubs"], summary: "Get all clubs" },
        })
        .post(
          "/assign",
          ({ body }) => ctrl.assignUserToClub(body),
          {
            body: t.Object({ userId: t.String(), clubId: t.String() }),
            detail: { tags: ["Clubs"], summary: "Assign a user to a club" },
          },
        )
        .delete("/:id", ({ params }) => ctrl.deleteClub(params.id), {
          detail: { tags: ["Clubs"], summary: "Delete a club" },
        }),
    )

    // CLUB_ADMIN can update their club
    .group("/manage", (app) =>
      app
        .derive(requireRoles(jwtService, "SYSTEM_ADMIN", "CLUB_ADMIN"))
        .put("/:id", ({ params, body }) => ctrl.updateClub(params.id, body), {
          body: t.Object({
            name: t.Optional(t.String()),
            location: t.Optional(t.String()),
            profilePicture: t.Optional(t.File()),
            banner: t.Optional(t.File()),
          }),
          detail: { tags: ["Clubs"], summary: "Update club details" },
        }),
    )

    // All authenticated users can view a club's details
    .group("", (app) =>
      app
        .derive(
          requireRoles(
            jwtService,
            "PLAYER",
            "COACH",
            "CLUB_ADMIN",
            "SYSTEM_ADMIN",
          ),
        )
        .get("/:id", ({ params }) => ctrl.getClub(params.id), {
          detail: { tags: ["Clubs"], summary: "Get club details and roster" },
        }),
    );
