export interface JwtPayload {
  sub: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface IJwtService {
  sign(payload: Omit<JwtPayload, "iat" | "exp">): string;
  verify(token: string): JwtPayload;
}
