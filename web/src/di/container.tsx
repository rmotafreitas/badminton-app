import React, { createContext, useContext, useMemo } from "react";
import { AuthRepoImpl } from "@/core/repositories/auth-repo";
import { AuthServiceImpl } from "@/core/services/auth-service";
import type { AuthService } from "@/core/services/interfaces/auth-service";

import { ClubRepoImpl } from "@/core/repositories/club-repo";
import { ClubServiceImpl } from "@/core/services/club-service";
import type { ClubService } from "@/core/services/interfaces/club-service";

import { GameRepoImpl } from "@/core/repositories/game-repo";
import { GameServiceImpl } from "@/core/services/game-service";
import type { GameService } from "@/core/services/interfaces/game-service";

import { ProfileRepoImpl } from "@/core/repositories/profile-repo";
import { ProfileServiceImpl } from "@/core/services/profile-service";
import type { ProfileService } from "@/core/services/interfaces/profile-service";

import { UserRepoImpl } from "@/core/repositories/user-repo";
import { UserServiceImpl } from "@/core/services/user-service";
import type { UserService } from "@/core/services/interfaces/user-service";

interface DIContainer {
  authService: AuthService;
  clubService: ClubService;
  gameService: GameService;
  profileService: ProfileService;
  userService: UserService;
}

const DIContext = createContext<DIContainer | null>(null);

export const DIProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const container = useMemo<DIContainer>(() => {
    const authRepository = new AuthRepoImpl();
    const authService = new AuthServiceImpl(authRepository);

    const clubRepository = new ClubRepoImpl();
    const clubService = new ClubServiceImpl(clubRepository);

    const gameRepository = new GameRepoImpl();
    const gameService = new GameServiceImpl(gameRepository);

    const profileRepository = new ProfileRepoImpl();
    const profileService = new ProfileServiceImpl(profileRepository);

    const userRepository = new UserRepoImpl();
    const userService = new UserServiceImpl(userRepository);

    return { authService, clubService, gameService, profileService, userService };
  }, []);

  return <DIContext.Provider value={container}>{children}</DIContext.Provider>;
};

const useDI = (): DIContainer => {
  const context = useContext(DIContext);
  if (!context) throw new Error("useDI must be used within DIProvider");
  return context;
};

export const useAuthService = () => useDI().authService;
export const useClubService = () => useDI().clubService;
export const useGameService = () => useDI().gameService;
export const useProfileService = () => useDI().profileService;
export const useUserService = () => useDI().userService;
