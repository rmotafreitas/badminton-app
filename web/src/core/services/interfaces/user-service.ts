import type { UserView } from "@/core/repositories/interfaces/user-repo";

export interface UserService {
  getAllUsers(): Promise<UserView[]>;
}
