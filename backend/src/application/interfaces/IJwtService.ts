export type TokenType = "access" | "refresh";

export interface JwtPayload {
  sub: string;
  roles: string[];
  type: TokenType;
  iat?: number;
  exp?: number;
}

export interface IJwtService {
  sign(payload: { sub: string; roles: string[] }): string;
  signRefresh(payload: { sub: string; roles: string[] }): string;
  verify(token: string, expectedType?: TokenType): JwtPayload;
}
