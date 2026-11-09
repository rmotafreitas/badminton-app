import { createHash, randomBytes, randomInt } from "node:crypto";
import type { PasswordVerifier, Secrets } from "@bb/application";
import bcrypt from "bcryptjs";

export const cryptoSecrets: Secrets = {
  token: () => randomBytes(32).toString("base64url"),
  numericCode: (digits) => String(randomInt(0, 10 ** digits)).padStart(digits, "0"),
  hash: (secret) => createHash("sha256").update(secret).digest("hex"),
};

export const bcryptPasswords: PasswordVerifier = {
  verify: (password, hash) => bcrypt.compare(password, hash),
};

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 10);
