import {
  AcquireAnalysisLock,
  AssignUserToClub,
  type Cache,
  type ClubRepository,
  type Clock,
  CheckReadiness,
  CompleteSignIn,
  CompleteVideoUpload,
  CreateClub,
  CreateRallySession,
  DeleteClub,
  DeleteGame,
  DeleteRallySession,
  DeleteTrainingReview,
  GetClub,
  GetGame,
  GetImage,
  GetMyTrainingReview,
  GetProfile,
  GetRallySession,
  GetRallyUsage,
  GetRatingHistory,
  GetResultUrl,
  GetVideoUrl,
  type GameRepository,
  type GoogleVerifier,
  type HealthProbe,
  type ImageProcessor,
  LeaveRallySession,
  ListClubGames,
  ListClubs,
  ListGameRallySessions,
  ListMyRallySessions,
  ListMyTrainingReviews,
  ListPlayerGames,
  ListProfileRallySessions,
  ListSharedGames,
  ListUsers,
  type Logger,
  type ObjectStorage,
  type PasswordVerifier,
  type PlayerDirectory,
  type ProfileRepository,
  PurgeExpiredCredentials,
  PurgeExpiredVideos,
  RatingService,
  type RallySessionRepository,
  type RateLimiter,
  RegisterGame,
  ReleaseAnalysisLock,
  RequestResultUpload,
  RequestVideoUpload,
  ResolveSession,
  SaveTrainingReview,
  type Secrets,
  type SessionRepository,
  type SignInChallengeRepository,
  type SignInMessenger,
  SignOut,
  StartSignIn,
  SubmitAnalysisResult,
  type TrainingReviewRepository,
  UpdateClub,
  UpdateGame,
  UpdateMyProfile,
  UpdateRallySession,
  type UserRepository,
} from "@bb/application";
import type { Config, SignInProvider } from "@bb/config";
import {
  bcryptPasswords,
  consoleLogger,
  createDatabase,
  createMessenger,
  cryptoSecrets,
  googleVerifier,
  MongoRateLimiter,
  mongoHealth,
  noopCache,
  PrismaChallengeRepository,
  PrismaClubRepository,
  PrismaGameRepository,
  PrismaPlayerDirectory,
  PrismaProfileRepository,
  PrismaRallySessionRepository,
  PrismaSessionRepository,
  PrismaTrainingReviewRepository,
  PrismaUserRepository,
  S3ObjectStorage,
  sharpImageProcessor,
  systemClock,
  unconfiguredStorage,
} from "@bb/infrastructure";

/** Every adapter the use cases need, built once per process. Tests replace any of them through `overrides`. */
export interface Infrastructure {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly cache: Cache;
  readonly health: HealthProbe;
  readonly limiter: RateLimiter;
  readonly secrets: Secrets;
  readonly passwords: PasswordVerifier;
  readonly google: GoogleVerifier;
  readonly messenger: SignInMessenger;
  readonly images: ImageProcessor;
  readonly storage: ObjectStorage;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly challenges: SignInChallengeRepository;
  readonly clubs: ClubRepository;
  readonly games: GameRepository;
  readonly players: PlayerDirectory;
  readonly profiles: ProfileRepository;
  readonly reviews: TrainingReviewRepository;
  readonly rally: RallySessionRepository;
}

export type InfrastructureOverrides = Partial<Infrastructure>;

export interface AppSettings {
  readonly appOrigin: string;
  readonly registrationOpen: boolean;
  /** Undefined: every sign-in method. */
  readonly signInProviders?: readonly SignInProvider[];
}

export function createInfrastructure(config: Config, overrides: InfrastructureOverrides = {}): Infrastructure {
  const db = createDatabase(config.databaseUrl);
  const logger = overrides.logger ?? consoleLogger({ service: "api" });
  return {
    clock: systemClock,
    logger,
    cache: noopCache,
    health: mongoHealth(db),
    limiter: new MongoRateLimiter(db),
    secrets: cryptoSecrets,
    passwords: bcryptPasswords,
    google: googleVerifier(config.googleClientId),
    messenger: createMessenger(
      { smtp: config.smtp, twilio: config.twilio, logInsteadOfSend: config.environment !== "production" },
      logger,
    ),
    images: sharpImageProcessor,
    storage: config.s3 ? new S3ObjectStorage(config.s3) : unconfiguredStorage,
    users: new PrismaUserRepository(db),
    sessions: new PrismaSessionRepository(db),
    challenges: new PrismaChallengeRepository(db),
    clubs: new PrismaClubRepository(db),
    games: new PrismaGameRepository(db),
    players: new PrismaPlayerDirectory(db),
    profiles: new PrismaProfileRepository(db),
    reviews: new PrismaTrainingReviewRepository(db),
    rally: new PrismaRallySessionRepository(db),
    ...overrides,
  };
}

/** One factory per bounded context: the use cases, constructed with their adapters. */
export function createIdentityModule(infra: Infrastructure, settings: AppSettings) {
  const enabledProviders = settings.signInProviders ? new Set(settings.signInProviders) : undefined;
  const common = { users: infra.users, secrets: infra.secrets, limiter: infra.limiter, clock: infra.clock };
  return {
    startSignIn: new StartSignIn({
      ...common,
      challenges: infra.challenges,
      messenger: infra.messenger,
      appOrigin: settings.appOrigin,
      registrationOpen: settings.registrationOpen,
      enabledProviders,
    }),
    completeSignIn: new CompleteSignIn({
      ...common,
      sessions: infra.sessions,
      challenges: infra.challenges,
      google: infra.google,
      passwords: infra.passwords,
      registrationOpen: settings.registrationOpen,
      enabledProviders,
    }),
    resolveSession: new ResolveSession({ sessions: infra.sessions, users: infra.users, secrets: infra.secrets, clock: infra.clock }),
    signOut: new SignOut({ sessions: infra.sessions }),
    purgeExpiredCredentials: new PurgeExpiredCredentials({
      sessions: infra.sessions,
      challenges: infra.challenges,
      limiter: infra.limiter,
      clock: infra.clock,
    }),
    checkReadiness: new CheckReadiness({ health: infra.health }),
    listUsers: new ListUsers({ users: infra.users }),
  };
}

export function createClubsModule(infra: Infrastructure) {
  const deps = { clubs: infra.clubs, users: infra.users, images: infra.images };
  return {
    getClub: new GetClub(deps),
    listClubs: new ListClubs(deps),
    createClub: new CreateClub(deps),
    updateClub: new UpdateClub(deps),
    deleteClub: new DeleteClub(deps),
    assignUserToClub: new AssignUserToClub(deps),
  };
}

export function createGamesModule(infra: Infrastructure) {
  const ratings = new RatingService({ games: infra.games, users: infra.users, log: infra.logger });
  const deps = { games: infra.games, users: infra.users, players: infra.players, ratings, clock: infra.clock };
  return {
    ratings,
    registerGame: new RegisterGame(deps),
    getGame: new GetGame(deps),
    updateGame: new UpdateGame(deps),
    deleteGame: new DeleteGame(deps),
    listClubGames: new ListClubGames(deps),
    listPlayerGames: new ListPlayerGames(deps),
    listSharedGames: new ListSharedGames(deps),
    getRatingHistory: new GetRatingHistory(deps),
  };
}

export function createProfilesModule(infra: Infrastructure) {
  return {
    getProfile: new GetProfile({ profiles: infra.profiles }),
    updateMyProfile: new UpdateMyProfile({ profiles: infra.profiles, images: infra.images }),
    getImage: new GetImage({ profiles: infra.profiles, clubs: infra.clubs }),
  };
}

export function createTrainingModule(infra: Infrastructure) {
  const deps = { reviews: infra.reviews };
  return {
    saveTrainingReview: new SaveTrainingReview(deps),
    listMyTrainingReviews: new ListMyTrainingReviews(deps),
    getMyTrainingReview: new GetMyTrainingReview(deps),
    deleteTrainingReview: new DeleteTrainingReview(deps),
  };
}

export function createRallyModule(infra: Infrastructure) {
  const deps = { sessions: infra.rally, users: infra.users, storage: infra.storage, clock: infra.clock };
  return {
    createRallySession: new CreateRallySession(deps),
    listMyRallySessions: new ListMyRallySessions(deps),
    listGameRallySessions: new ListGameRallySessions(deps),
    getRallySession: new GetRallySession(deps),
    updateRallySession: new UpdateRallySession(deps),
    leaveRallySession: new LeaveRallySession(deps),
    deleteRallySession: new DeleteRallySession(deps),
    getRallyUsage: new GetRallyUsage(deps),
    requestVideoUpload: new RequestVideoUpload(deps),
    completeVideoUpload: new CompleteVideoUpload(deps),
    getVideoUrl: new GetVideoUrl(deps),
    acquireAnalysisLock: new AcquireAnalysisLock(deps),
    releaseAnalysisLock: new ReleaseAnalysisLock(deps),
    requestResultUpload: new RequestResultUpload(deps),
    submitAnalysisResult: new SubmitAnalysisResult(deps),
    getResultUrl: new GetResultUrl(deps),
    purgeExpiredVideos: new PurgeExpiredVideos(deps),
    listProfileRallySessions: new ListProfileRallySessions(deps),
  };
}

/** Everything the API needs, as one object (`ApiDeps` in apps/api mirrors it). */
export function createModules(infra: Infrastructure, settings: AppSettings) {
  return {
    ...createIdentityModule(infra, settings),
    ...createClubsModule(infra),
    ...createGamesModule(infra),
    ...createProfilesModule(infra),
    ...createTrainingModule(infra),
    ...createRallyModule(infra),
  };
}

export type Modules = ReturnType<typeof createModules>;
