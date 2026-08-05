import jwt from "jsonwebtoken";
import type { IJwtService, JwtPayload, TokenType } from "@/application/interfaces/IJwtService";

export class JwtService implements IJwtService {
  constructor(
    private readonly secret: string,
    private readonly accessExpiresIn: string = "15m",
    private readonly refreshExpiresIn: string = "30d",
  ) {
    if (!secret || secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters");
    }
  }

  sign(payload: { sub: string; roles: string[] }): string {
    return jwt.sign({ ...payload, type: "access" }, this.secret, {
      expiresIn: this.accessExpiresIn,
    } as jwt.SignOptions);
  }

  signRefresh(payload: { sub: string; roles: string[] }): string {
    return jwt.sign({ ...payload, type: "refresh" }, this.secret, {
      expiresIn: this.refreshExpiresIn,
    } as jwt.SignOptions);
  }

  verify(token: string, expectedType?: TokenType): JwtPayload {
    const payload = jwt.verify(token, this.secret) as JwtPayload;
    if (expectedType && payload.type !== expectedType) {
      throw new Error(`Expected ${expectedType} token, got ${payload.type}`);
    }
    return payload;
  }
}
