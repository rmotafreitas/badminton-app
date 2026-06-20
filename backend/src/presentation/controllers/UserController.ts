import type { IUserRepo } from "@/domain/repositories/IUserRepo";
import type { UserView } from "@/application/views/user.view";
import { UserMapper } from "@/application/mappers/UserMapper";

export class UserController {
  constructor(private readonly userRepo: IUserRepo) {}

  async getAllUsers(): Promise<UserView[]> {
    const users = await this.userRepo.findAll();
    return users.map(UserMapper.toView);
  }
}
