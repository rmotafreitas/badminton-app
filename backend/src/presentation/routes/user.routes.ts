import Elysia from "elysia";
import type { UserController } from "@/presentation/controllers/UserController";
import { requireRoles } from "@/presentation/middleware/auth.guard";
import type { JwtService } from "@/application/jwt/JwtService";

export const userRoutes = (ctrl: UserController, jwtService: JwtService) =>
  new Elysia({ prefix: "/users" })
    .derive(requireRoles(jwtService, "SYSTEM_ADMIN"))
    .get("/", () => ctrl.getAllUsers(), {
      detail: { tags: ["Users"], summary: "Get all users" },
    });
