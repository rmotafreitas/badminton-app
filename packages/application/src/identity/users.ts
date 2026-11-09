import { type Actor, Forbidden, isSystemAdmin, type User } from "@bb/domain";
import type { UserRepository } from "./ports";

/** Every account (system admins: the Users and Clubs admin pages). */
export class ListUsers {
  constructor(private readonly deps: { users: UserRepository }) {}
  async execute({ actor }: { actor: Actor }): Promise<User[]> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    return this.deps.users.listAll();
  }
}
