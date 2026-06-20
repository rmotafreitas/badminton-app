import type { UserService } from "@/core/services/interfaces/user-service";
import type { UserRepo, UserView } from "@/core/repositories/interfaces/user-repo";

export class UserServiceImpl implements UserService {
  private readonly userRepo: UserRepo;

  constructor(userRepo: UserRepo) {
    this.userRepo = userRepo;
  }

  async getAllUsers(): Promise<UserView[]> {
    return this.userRepo.getAll();
  }
}
