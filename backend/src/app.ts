import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { PrismaClient } from "@prisma/client";

// ── Application ───────────────────────────────────────────────────────────────
import { PrismaUserRepo } from "@/application/repositories/PrismaUserRepo";
import { PrismaMagicTokenRepo } from "@/application/repositories/PrismaMagicTokenRepo";
import { SmtpEmailChannel } from "@/application/communication/SmtpEmailChannel";
import { TwilioSmsChannel } from "@/application/communication/TwilioSmsChannel";
import { CommunicationService } from "@/application/communication/CommunicationService";
import { GoogleAuthProvider } from "@/application/providers/GoogleAuthProvider";
import { EmailMagicProvider } from "@/application/providers/EmailMagicProvider";
import { EmailCodeProvider } from "@/application/providers/EmailCodeProvider";
import { PhoneSmsProvider } from "@/application/providers/PhoneSmsProvider";
import { PasswordAuthProvider } from "@/application/providers/PasswordAuthProvider";
import { JwtService } from "@/application/jwt/JwtService";
import { AuthService } from "@/application/services/AuthService";

import { PrismaClubRepo } from "@/application/repositories/PrismaClubRepo";
import { PrismaProfileRepo } from "@/application/repositories/PrismaProfileRepo";
import { PrismaGameRepo } from "@/application/repositories/PrismaGameRepo";
import { ClubService } from "@/application/services/ClubService";
import { ProfileService } from "@/application/services/ProfileService";
import { GameService } from "@/application/services/GameService";

import type { IAuthProvider } from "@/application/interfaces/IAuthProvider";
import type { IUserRepo } from "@/domain/repositories/IUserRepo";
import type { IMagicTokenRepo } from "@/domain/repositories/IMagicTokenRepo";
import type { IClubRepo } from "@/domain/repositories/IClubRepo";
import type { IProfileRepo } from "@/domain/repositories/IProfileRepo";
import type { IGameRepo } from "@/domain/repositories/IGameRepo";

// ── Presentation ──────────────────────────────────────────────────────────────
import { AuthController } from "@/presentation/controllers/AuthController";
import { authRoutes } from "@/presentation/routes/auth.routes";
import { ProfileController } from "@/presentation/controllers/ProfileController";
import { profileRoutes } from "@/presentation/routes/profile.routes";
import { ClubController } from "@/presentation/controllers/ClubController";
import { clubRoutes } from "@/presentation/routes/club.routes";
import { GameController } from "@/presentation/controllers/GameController";
import { gameRoutes } from "@/presentation/routes/game.routes";
import { UserController } from "@/presentation/controllers/UserController";
import { userRoutes } from "@/presentation/routes/user.routes";

export interface AppDependencies {
  prisma?: PrismaClient;
  userRepo?: IUserRepo;
  magicTokenRepo?: IMagicTokenRepo;
  clubRepo?: IClubRepo;
  profileRepo?: IProfileRepo;
  gameRepo?: IGameRepo;
  jwtSecret?: string;
  communicationService?: CommunicationService;
  authProviders?: IAuthProvider[];
}

export function createApp(deps: AppDependencies = {}) {
  const prisma = deps.prisma ?? new PrismaClient();

  const userRepo = deps.userRepo ?? new PrismaUserRepo(prisma);
  const magicTokenRepo =
    deps.magicTokenRepo ?? new PrismaMagicTokenRepo(prisma);
  const clubRepo = deps.clubRepo ?? new PrismaClubRepo(prisma);
  const profileRepo = deps.profileRepo ?? new PrismaProfileRepo(prisma);
  const gameRepo = deps.gameRepo ?? new PrismaGameRepo(prisma);

  const jwtService = new JwtService(
    deps.jwtSecret ?? process.env.JWT_SECRET ?? "unsafe-default-for-tests-only",
  );

  const communicationService =
    deps.communicationService ??
    new CommunicationService([
      new SmtpEmailChannel({
        host: process.env.SMTP_HOST!,
        port: parseInt(process.env.SMTP_PORT ?? "587"),
        secure: process.env.SMTP_SECURE === "true",
        username: process.env.SMTP_USERNAME!,
        password: process.env.SMTP_PASSWORD!,
        fromAddress: process.env.SMTP_FROM!,
        fromName: process.env.SMTP_FROM_NAME,
      }),
      new TwilioSmsChannel(
        process.env.TWILIO_ACCOUNT_SID!,
        process.env.TWILIO_AUTH_TOKEN!,
        process.env.TWILIO_FROM_NUMBER!,
      ),
    ]);

  const authProviders = deps.authProviders ?? [
    new GoogleAuthProvider(process.env.GOOGLE_CLIENT_ID!),
    new EmailMagicProvider(
      magicTokenRepo,
      communicationService,
      process.env.APP_URL!,
    ),
    new EmailCodeProvider(magicTokenRepo, communicationService),
    new PhoneSmsProvider(magicTokenRepo, communicationService),
    new PasswordAuthProvider(userRepo),
  ];

  const clubService = new ClubService(clubRepo);
  const profileService = new ProfileService(profileRepo, userRepo);
  const gameService = new GameService(gameRepo, userRepo);

  const enableRegistration = process.env.ENABLE_REGISTRATION !== "0";

  const authService = new AuthService(
    userRepo,
    jwtService,
    authProviders,
    enableRegistration,
  );
  const authController = new AuthController(authService);
  const profileController = new ProfileController(profileService);
  const clubController = new ClubController(clubService, userRepo as any);
  const gameController = new GameController(gameService);
  const userController = new UserController(userRepo);

  const app = new Elysia()
    .use(
      swagger({
        path: "/swagger",
        documentation: {
          info: {
            title: "Badminton Buddy API",
            version: "2.0.0",
            description: "Backend API for Badminton Buddy",
          },
          tags: [
            { name: "Health", description: "Health check" },
            { name: "Auth", description: "Authentication flow" },
            { name: "Claims", description: "Token claims (authenticated)" },
            { name: "Profile", description: "Profile endpoints" },
            { name: "Clubs", description: "Club management endpoints" },
            { name: "Games", description: "Game registration endpoints" },
            { name: "Users", description: "User management endpoints" },
          ],
          components: {
            securitySchemes: {
              cookieAuth: {
                type: "apiKey",
                in: "cookie",
                name: "auth_token",
              },
            },
          },
        },
      }),
    )
    .use(
      cors({
        origin: process.env.FRONTEND_URL ?? "https://localhost:5173",
        credentials: true,
        allowedHeaders: ["Content-Type"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      }),
    )
    .use(authRoutes(authController, jwtService))
    .use(profileRoutes(profileController, jwtService))
    .use(clubRoutes(clubController, jwtService))
    .use(gameRoutes(gameController, jwtService))
    .use(userRoutes(userController, jwtService))
    .get("/health", () => ({ status: "ok", ts: new Date().toISOString() }), {
      detail: { tags: ["Health"] },
    });

  return app;
}
