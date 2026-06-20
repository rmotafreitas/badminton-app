import {
  AuthCallbackPage,
  LoginPage,
  UnauthorizedPage,
  LogoutPage,
  NotFoundPage,
  DashboardPage,
  GamesPage,
  GameDetailPage,
  UsersPage,
  ClubsPage,
  ProfilePage,
} from "@/pages";
import { LayoutAdmin, LayoutApp, LayoutLogin } from "@/routes/layouts";
import type { Role } from "@/core/domain/roles";

interface Route {
  path: string;
  element: React.ReactNode;
  layout: React.ComponentType<{ children: React.ReactNode }>;
  roles?: Role[];
}

export const publicRoutes: readonly Route[] = [
  {
    path: "/",
    element: <LoginPage />,
    layout: LayoutLogin,
  },
  {
    path: "/auth/callback",
    element: <AuthCallbackPage />,
    layout: LayoutApp,
  },
  {
    path: "/unauthorized",
    element: <UnauthorizedPage />,
    layout: LayoutApp,
  },
  {
    path: "/logout",
    element: <LogoutPage />,
    layout: LayoutApp,
  },
  {
    path: "*",
    element: <NotFoundPage />,
    layout: LayoutApp,
  },
] as const;

export const protectedRoutes: readonly Route[] = [
  {
    path: "/dashboard",
    element: <DashboardPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
  },
  {
    path: "/games",
    element: <GamesPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
  },
  {
    path: "/games/:id",
    element: <GameDetailPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
  },
  {
    path: "/users",
    element: <UsersPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
  },
  {
    path: "/clubs",
    element: <ClubsPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN"],
  },
  {
    path: "/profile",
    element: <ProfilePage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
  },
] as const;
