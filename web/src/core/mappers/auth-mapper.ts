import type { AuthUserInfo, AuthInitResult } from "@/core/domain/auth";
import type { Role } from "@/core/domain/roles";
import type { AuthUserDTO, AuthInitResultDTO } from "@/core/dtos/auth.dto";

export class AuthMapper {
  static toAuthUserInfo(dto: AuthUserDTO): AuthUserInfo {
    return {
      userId: dto.userId,
      email: dto.email,
      phone: dto.phone,
      roles: dto.roles as Role[],
      eloSingles: dto.eloSingles,
      eloDoubles: dto.eloDoubles,
      clubId: dto.clubId,
    };
  }

  static toAuthInitResult(dto: AuthInitResultDTO): AuthInitResult {
    return {
      type: dto.type,
      redirectUrl: dto.redirectUrl,
      message: dto.message,
    };
  }
}
