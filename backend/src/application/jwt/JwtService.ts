import jwt from "jsonwebtoken";
import type { IJwtService, JwtPayload } from "@/application/interfaces/IJwtService";

export class JwtService implements IJwtService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string = "7d",
  ) {
    if (!secret || secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters");
    }
  }

  sign(payload: Omit<JwtPayload, "iat" | "exp">): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn,
    } as jwt.SignOptions);
  }

  verify(token: string): JwtPayload {
    return jwt.verify(token, this.secret) as JwtPayload;
  }
}
