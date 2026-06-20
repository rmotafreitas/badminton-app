import type { UserRepo, UserView } from "@/core/repositories/interfaces/user-repo";
import api from "@/lib/api";

export class UserRepoImpl implements UserRepo {
  async getAll(): Promise<UserView[]> {
    const { data } = await api.get<UserView[]>("/users/");
    return data;
  }
}
