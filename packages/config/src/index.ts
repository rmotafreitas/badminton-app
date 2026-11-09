import { z } from "zod";

const flag = (fallback: boolean) =>
  z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "1" || v === "true"));

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

/** Every sign-in method the API knows. */
export const SIGN_IN_PROVIDERS = ["google", "email", "email-code", "phone", "password"] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** The web app's origin, e.g. https://badminton.example.com. Builds sign-in links; the only Origin writes may come from. */
  APP_URL: z.url(),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Serve the API over local HTTPS (mkcert) when running it directly in dev. */
  API_LOCAL_HTTPS: flag(false),
  ENABLE_REGISTRATION: flag(true),
  /** Comma-separated sign-in methods the API accepts, e.g. `password`. Unset: all of them. */
  SIGN_IN_PROVIDERS: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.split(",").map((p) => p.trim()).filter(Boolean) : undefined))
    .pipe(z.array(z.enum(SIGN_IN_PROVIDERS)).min(1).optional()),
  GOOGLE_CLIENT_ID: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: flag(false),
  SMTP_USERNAME: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: optional,
  SMTP_FROM_NAME: z.string().default("Badminton Buddy"),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM_NUMBER: optional,
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  /** Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`. */
  CRON_SECRET: optional,
});

export interface Config {
  readonly environment: "development" | "production" | "test";
  readonly databaseUrl: string;
  readonly appOrigin: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly apiLocalHttps: boolean;
  readonly registrationOpen: boolean;
  /** Undefined: every method. */
  readonly signInProviders: readonly SignInProvider[] | undefined;
  readonly googleClientId: string | undefined;
  readonly smtp:
    | { host: string; port: number; secure: boolean; username?: string; password?: string; from: string; fromName: string }
    | undefined;
  readonly twilio: { accountSid: string; authToken: string; fromNumber: string } | undefined;
  readonly s3:
    | { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }
    | undefined;
  readonly cronSecret: string | undefined;
}

/** Reads and validates the environment once, at the composition root. Nothing else reads `process.env`. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  const e = parsed.data;
  return {
    environment: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    appOrigin: new URL(e.APP_URL).origin,
    apiHost: e.API_HOST,
    apiPort: e.API_PORT,
    apiLocalHttps: e.API_LOCAL_HTTPS,
    registrationOpen: e.ENABLE_REGISTRATION,
    signInProviders: e.SIGN_IN_PROVIDERS,
    googleClientId: e.GOOGLE_CLIENT_ID,
    smtp:
      e.SMTP_HOST && e.SMTP_FROM
        ? {
            host: e.SMTP_HOST,
            port: e.SMTP_PORT,
            secure: e.SMTP_SECURE,
            username: e.SMTP_USERNAME,
            password: e.SMTP_PASSWORD,
            from: e.SMTP_FROM,
            fromName: e.SMTP_FROM_NAME,
          }
        : undefined,
    twilio:
      e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_FROM_NUMBER
        ? { accountSid: e.TWILIO_ACCOUNT_SID, authToken: e.TWILIO_AUTH_TOKEN, fromNumber: e.TWILIO_FROM_NUMBER }
        : undefined,
    s3:
      e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
        ? {
            endpoint: e.S3_ENDPOINT,
            region: e.S3_REGION,
            bucket: e.S3_BUCKET,
            accessKeyId: e.S3_ACCESS_KEY_ID,
            secretAccessKey: e.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    cronSecret: e.CRON_SECRET,
  };
}
