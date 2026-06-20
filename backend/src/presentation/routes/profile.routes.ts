import Elysia, { t } from "elysia";
import type { ProfileController } from "@/presentation/controllers/ProfileController";
import { requireRoles } from "@/presentation/middleware/auth.guard";
import type { JwtService } from "@/application/jwt/JwtService";

export const profileRoutes = (
  ctrl: ProfileController,
  jwtService: JwtService,
) =>
  new Elysia({ prefix: "/profile" })
    .derive(
      requireRoles(jwtService, "PLAYER", "COACH", "CLUB_ADMIN", "SYSTEM_ADMIN"),
    )

    .get("/me", ({ currentUser }) => ctrl.getMyProfile(currentUser.sub), {
      detail: { tags: ["Profile"], summary: "Get current user profile" },
    })

    .put(
      "/me",
      ({ currentUser, body }) => ctrl.updateMyProfile(currentUser.sub, body),
      {
        body: t.Object({
          name: t.Optional(t.String()),
          birthday: t.Optional(t.String()),
          sex: t.Optional(t.String()),
          photo: t.Optional(t.File()),
          banner: t.Optional(t.File()),
          bio: t.Optional(t.String()),
        }),
        detail: { tags: ["Profile"], summary: "Update current user profile" },
      },
    )

    .get("/:userId", ({ params: { userId } }) => ctrl.getProfile(userId), {
      detail: { tags: ["Profile"], summary: "Get a specific user's profile" },
    });
