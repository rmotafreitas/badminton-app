import {
  type Actor,
  BadRequest,
  BusinessRuleViolation,
  Conflict,
  Forbidden,
  isObjectId,
  isSystemAdmin,
  NotFound,
  nextMemberRoles,
  type Role,
  type User,
} from "@bb/domain";
import type { ClubRepository } from "@/clubs";
import type { GameRepository } from "@/games";
import type { ProfileRepository } from "@/profiles";
import type { RallySessionRepository } from "@/rally";
import type { RegistrationRepository } from "@/registrations";
import type { ObjectStorage } from "@/shared";
import { isEmail, normalizeEmail, normalizePhone } from "./phone";
import type { UserRepository } from "./ports";

/** Account management by system admins (the Data screens). Club admins use the membership use cases instead. */
export interface AccountInput {
  readonly name?: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly roles?: readonly Role[];
  readonly clubId?: string | null;
  readonly isActive?: boolean;
}

interface Deps {
  readonly users: UserRepository;
  readonly clubs: Pick<ClubRepository, "findById">;
  readonly profiles: Pick<ProfileRepository, "update">;
  readonly games: Pick<GameRepository, "countForUser">;
  readonly rally: Pick<RallySessionRepository, "findForUser">;
  readonly registrations: Pick<RegistrationRepository, "listByUser">;
  readonly storage: Pick<ObjectStorage, "delete">;
}

export const cleanPersonName = (name: string) => {
  const trimmed = name.trim();
  if (trimmed.length > 80) throw new BusinessRuleViolation("A name has at most 80 characters.");
  return trimmed;
};

/** Normalised email/phone, checked to belong to nobody else. `undefined` = not given, `null` = clear it. */
export async function contactFor(
  users: UserRepository,
  input: { email?: string | null; phone?: string | null },
  selfId: string | null,
): Promise<{ email?: string | null; phone?: string | null }> {
  const out: { email?: string | null; phone?: string | null } = {};
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (email && !isEmail(email)) throw new BusinessRuleViolation("That email address doesn't look right.", "invalid_email");
    const owner = email ? await users.findByEmail(email) : null;
    if (owner && owner.id !== selfId) throw new Conflict("Another account already uses this email.", "email_taken");
    out.email = email || null;
  }
  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    if (input.phone?.trim() && phone.replace("+", "").length < 6) throw new BusinessRuleViolation("That phone number doesn't look right.", "invalid_phone");
    const owner = phone ? await users.findByPhone(phone) : null;
    if (owner && owner.id !== selfId) throw new Conflict("Another account already uses this phone number.", "phone_taken");
    out.phone = phone || null;
  }
  return out;
}

async function checkClub(clubs: Deps["clubs"], clubId: string | null | undefined) {
  if (clubId && (!isObjectId(clubId) || !(await clubs.findById(clubId)))) throw new NotFound("Club not found.");
}

/** A system admin creates an account ahead of the person's first sign-in (an invite). */
export class CreateAccount {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, input }: { actor: Actor; input: AccountInput }): Promise<User> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    const contact = await contactFor(this.deps.users, input, null);
    if (!contact.email && !contact.phone) throw new BadRequest("Give an email or a phone number, so they can sign in.", "contact_required");
    await checkClub(this.deps.clubs, input.clubId);
    return this.deps.users.createInvited({
      email: contact.email ?? undefined,
      phone: contact.phone ?? undefined,
      name: input.name === undefined ? undefined : cleanPersonName(input.name),
      roles: nextMemberRoles(actor, [], input.roles ?? []),
      clubId: input.clubId ?? null,
    });
  }
}

export class UpdateAccount {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, userId, input }: { actor: Actor; userId: string; input: AccountInput }): Promise<User> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    const user = isObjectId(userId) ? await this.deps.users.findById(userId) : null;
    if (!user) throw new NotFound("User not found.");
    if (userId === actor.userId) {
      if (input.isActive === false) throw new BusinessRuleViolation("You can't deactivate your own account.", "self_deactivate");
      if (input.roles && !input.roles.includes("SYSTEM_ADMIN")) {
        throw new BusinessRuleViolation("You can't remove your own admin role.", "self_demote");
      }
    }
    const contact = await contactFor(this.deps.users, input, userId);
    if ((contact.email === null || (contact.email === undefined && !user.email)) && (contact.phone === null || (contact.phone === undefined && !user.phone))) {
      throw new BadRequest("An account needs an email or a phone number to sign in.", "contact_required");
    }
    await checkClub(this.deps.clubs, input.clubId);
    if (contact.email !== undefined || contact.phone !== undefined || input.isActive !== undefined) {
      await this.deps.users.updateAccount(userId, { ...contact, ...(input.isActive !== undefined && { isActive: input.isActive }) });
    }
    if (input.clubId !== undefined && input.clubId !== user.clubId) await this.deps.users.setClub(userId, input.clubId);
    if (input.roles) await this.deps.users.setRoles(userId, nextMemberRoles(actor, user.roles, input.roles));
    if (input.name !== undefined) await this.deps.profiles.update(userId, { name: cleanPersonName(input.name) });
    const updated = await this.deps.users.findById(userId);
    if (!updated) throw new NotFound("User not found.");
    return updated;
  }
}

/** Accounts with history (games, rally sessions) are deactivated instead, so nobody's records lose a player. */
export class DeleteAccount {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, userId }: { actor: Actor; userId: string }): Promise<void> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    if (userId === actor.userId) throw new BusinessRuleViolation("You can't delete your own account.", "self_delete");
    if (!isObjectId(userId) || !(await this.deps.users.findById(userId))) throw new NotFound("User not found.");
    const history = (await this.deps.games.countForUser(userId)) + (await this.deps.rally.findForUser(userId)).length;
    if (history > 0) throw new Conflict("This account has games or recordings, so deactivate it instead.", "user_has_history");
    // Registrations and details go with the account (cascade); their signed scans live in storage, so delete those.
    const scans = (await this.deps.registrations.listByUser(userId)).flatMap((r) => (r.signedFileKey ? [r.signedFileKey] : []));
    await Promise.all(scans.map((key) => this.deps.storage.delete(key)));
    await this.deps.users.delete(userId);
  }
}
