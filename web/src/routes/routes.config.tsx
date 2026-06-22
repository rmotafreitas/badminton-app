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
import type { Dictionary } from "@/i18n";

interface Route {
  path: string;
  element: React.ReactNode;
  layout: React.ComponentType<{ children: React.ReactNode }>;
  roles?: Role[];
  getTitle?: (dict: Dictionary, searchParams: URLSearchParams) => string;
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
    getTitle: (dict) => dict.dashboard.dashboard,
  },
  {
    path: "/games",
    element: <GamesPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
    getTitle: (dict) => dict.games.registeredGames,
  },
  {
    path: "/games/:id",
    element: <GameDetailPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
    getTitle: (dict, searchParams) =>
      searchParams.get("edit") === "true" ? dict.games.editGame : dict.games.viewGame,
  },
  {
    path: "/users",
    element: <UsersPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
    getTitle: (dict) => dict.users.clubUsers,
  },
  {
    path: "/clubs",
    element: <ClubsPage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN"],
    getTitle: (dict) => dict.clubs.registeredClubs,
  },
  {
    path: "/profile",
    element: <ProfilePage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
    getTitle: (dict) => dict.profile.myProfile,
  },
  {
    path: "/profile/:id",
    element: <ProfilePage />,
    layout: LayoutAdmin,
    roles: ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"],
    getTitle: (dict) => dict.profile.myProfile,
  },
] as const;
