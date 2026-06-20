import type { AuthUserView } from "@/application/views/auth.view";
import type { User } from "@/domain/entities/User";

export class AuthMapper {
  static toView(user: User): AuthUserView {
    return {
      userId: user.id,
      roles: user.roles,
      elo: user.elo,
      email: user.email,
      phone: user.phone,
      clubId: user.clubId,
    };
  }
}
