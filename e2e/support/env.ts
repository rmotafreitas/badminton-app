const mongoBase = process.env.TEST_DATABASE_URL ?? "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const dbUrl = (() => {
  const url = new URL(mongoBase);
  url.pathname = "/bb_e2e";
  return url.toString();
})();

const apiPort = 3100;
const webPort = 5180;

export const E2E = {
  apiPort,
  webPort,
  apiUrl: `http://127.0.0.1:${apiPort}`,
  webUrl: `https://localhost:${webPort}`,
  databaseUrl: dbUrl,
  password: "e2e-password",
  cronSecret: "e2e-cron-secret",
  apiEnv: {
    NODE_ENV: "test",
    DATABASE_URL: dbUrl,
    APP_URL: `https://localhost:${webPort}`,
    API_HOST: "127.0.0.1",
    API_PORT: String(apiPort),
    ENABLE_REGISTRATION: "1",
    GOOGLE_CLIENT_ID: "",
    CRON_SECRET: "e2e-cron-secret",
  } as Record<string, string>,
} as const;

/** Seeded people (global-setup). Passwords are all `E2E.password`. */
export const PEOPLE = {
  admin: { email: "admin@e2e.test", name: "Ada Admin", phone: "+351911000001" },
  coach: { email: "carla@e2e.test", name: "Carla Coach", phone: "+351911000002" },
  ana: { email: "ana@e2e.test", name: "Ana Silva", phone: "+351911000003" },
  bruno: { email: "bruno@e2e.test", name: "Bruno Costa", phone: "+351911000004" },
  rui: { email: "rui@e2e.test", name: "Rui Santos", phone: "+351911000222" },
  clara: { email: "clara@e2e.test", name: "Clara Clube", phone: "+351911000005" },
} as const;
