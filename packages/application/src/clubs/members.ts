import {
  type Actor,
  BadRequest,
  BusinessRuleViolation,
  type ClubMember,
  Conflict,
  canManageClub,
  canViewClub,
  Forbidden,
  isObjectId,
  isSystemAdmin,
  lastAdminProblem,
  NotFound,
  clubMemberRoles,
  type Role,
  rolesAfterLeavingClub,
  type User,
} from "@bb/domain";
import { cleanPersonName, contactFor, normalizeEmail, normalizePhone, type UserRepository } from "@/identity";
import type { ProfileRepository } from "@/profiles";
import type { ClubRepository } from "./ports";

interface Deps {
  readonly clubs: ClubRepository;
  readonly users: UserRepository;
}

/** The club, after checking `actor` may manage it. Outsiders get NotFound (the club's existence is private). */
async function managedClub(deps: Deps, actor: Actor, clubId: string) {
  if (!isObjectId(clubId)) throw new NotFound("Club not found.");
  if (!canManageClub(actor, clubId)) throw canViewClub(actor, clubId) ? new Forbidden() : new NotFound("Club not found.");
  const club = await deps.clubs.findWithMembers(clubId);
  if (!club) throw new NotFound("Club not found.");
  return club;
}

/** SYSTEM_ADMIN is never a club role: asking for it is a client error, not something to drop quietly. */
function checkClubRoles(roles: readonly Role[] | undefined) {
  if (roles?.includes("SYSTEM_ADMIN")) throw new BadRequest("System admin isn't a club role.", "system_admin_not_member");
}

/**
 * Check-then-write, like `lastAdminProblem`: two admins demoting each other at the same instant could both pass. Rare,
 * and a system admin can repair it, so no transaction.
 *
 * After `userId` stops being an active club admin (demoted, deactivated or removed), the club must still have one who
 * can sign in. System admins may leave a club without one: they can fix it.
 */
async function keepsAnActiveAdmin(users: UserRepository, actor: Actor, members: readonly ClubMember[], userId: string) {
  if (isSystemAdmin(actor)) return;
  const target = members.find((m) => m.id === userId);
  if (!target?.roles.includes("CLUB_ADMIN")) return;
  const [self] = await users.findByIds([userId]);
  if (self && !self.isActive) return; // wasn't an active admin anyway
  const others = members.filter((m) => m.id !== userId && m.roles.includes("CLUB_ADMIN")).map((m) => m.id);
  if (!(await users.findByIds(others)).some((u) => u.isActive)) {
    throw new BusinessRuleViolation("A club needs at least one active club admin. Make someone else an admin first.", "last_club_admin");
  }
}

function memberOf(members: readonly ClubMember[], userId: string) {
  const member = members.find((m) => m.id === userId);
  if (!member) throw new NotFound("This person isn't a member of the club.");
  return member;
}

export type AddMemberInput =
  | { readonly userId: string }
  | { readonly email?: string; readonly phone?: string; readonly name?: string; readonly roles?: readonly Role[] };

/**
 * Adds someone to the club. An existing account without a club joins at once; an unknown email or phone becomes an
 * invite (the account is created now and linked on their first sign-in). Club admins can't take people from another
 * club: a system admin moves them.
 */
export class AddClubMember {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId, input }: { actor: Actor; clubId: string; input: AddMemberInput }): Promise<User> {
    await managedClub(this.deps, actor, clubId);
    if (!("userId" in input)) checkClubRoles(input.roles);
    const { users } = this.deps;
    let user: User | null;
    if ("userId" in input) {
      user = isObjectId(input.userId) ? await users.findById(input.userId) : null;
      if (!user) throw new NotFound("User not found.");
    } else {
      const email = normalizeEmail(input.email);
      const phone = normalizePhone(input.phone);
      if (!email && !phone) throw new BadRequest("Give an email or a phone number.", "contact_required");
      user = (email ? await users.findByEmail(email) : null) ?? (phone ? await users.findByPhone(phone) : null);
      if (!user) {
        // Nobody with that address yet: invite them (validates the address and that nobody else uses the other one).
        const contact = await contactFor(users, { email: email || undefined, phone: phone || undefined }, null);
        return users.createInvited({
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          name: input.name === undefined ? undefined : cleanPersonName(input.name),
          roles: clubMemberRoles(input.roles ?? []),
          clubId,
        });
      }
    }
    if (isSystemAdmin(user)) throw new Conflict("System admins run the platform: they aren't club members.", "system_admin_not_member");
    if (user.clubId === clubId) throw new Conflict("Already a member of this club.", "already_member");
    if (user.clubId && !isSystemAdmin(actor)) {
      throw new Conflict("This person belongs to another club. Ask a system admin to move them.", "in_other_club");
    }
    await users.setClub(user.id, clubId);
    // Club roles from a previous club don't carry over; the ones asked for here apply, as they do for an invite.
    const requested = "userId" in input ? [] : (input.roles ?? []);
    await users.setRoles(user.id, clubMemberRoles([...rolesAfterLeavingClub(user.roles), ...requested]));
    return (await users.findById(user.id)) ?? user;
  }
}

/** Takes someone out of the club. Their games stay (games belong to the club); they lose their club roles. */
export class RemoveClubMember {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId, userId }: { actor: Actor; clubId: string; userId: string }): Promise<void> {
    const club = await managedClub(this.deps, actor, clubId);
    const member = memberOf(club.members, userId);
    const problem = lastAdminProblem(actor, club.members, userId, null);
    if (problem) throw new BusinessRuleViolation(problem, "last_club_admin");
    await keepsAnActiveAdmin(this.deps.users, actor, club.members, userId);
    await this.deps.users.setClub(userId, null);
    await this.deps.users.setRoles(userId, rolesAfterLeavingClub(member.roles));
  }
}

/** Club admin, coach or player (always player). SYSTEM_ADMIN is never a club role. */
export class SetMemberRoles {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId, userId, roles }: { actor: Actor; clubId: string; userId: string; roles: readonly Role[] }): Promise<Role[]> {
    const club = await managedClub(this.deps, actor, clubId);
    const member = memberOf(club.members, userId);
    checkClubRoles(roles);
    const next = clubMemberRoles(roles);
    const problem = lastAdminProblem(actor, club.members, userId, next);
    if (problem) throw new BusinessRuleViolation(problem, "last_club_admin");
    if (!next.includes("CLUB_ADMIN")) await keepsAnActiveAdmin(this.deps.users, actor, club.members, userId);
    await this.deps.users.setRoles(userId, next);
    return next;
  }
}

export interface MemberChanges {
  readonly name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly roles?: readonly Role[];
  readonly isActive?: boolean;
}

/**
 * A club admin edits a member of their own club: name, email, phone, club roles and whether the account is active,
 * the same fields they can set when adding someone. Email and phone stay unique and valid, and the account keeps one of
 * them to sign in with. Nobody deactivates themselves, and the club keeps at least one active club admin.
 */
export class UpdateClubMember {
  constructor(private readonly deps: Deps & { readonly profiles: Pick<ProfileRepository, "update"> }) {}
  async execute({ actor, clubId, userId, changes }: { actor: Actor; clubId: string; userId: string; changes: MemberChanges }): Promise<User> {
    const club = await managedClub(this.deps, actor, clubId);
    const member = memberOf(club.members, userId);
    const { users } = this.deps;
    const user = await users.findById(userId);
    if (!user) throw new NotFound("This person isn't a member of the club.");

    checkClubRoles(changes.roles);
    // Everything is checked before anything is written.
    const name = changes.name === undefined ? undefined : cleanPersonName(changes.name ?? "");
    const nextRoles = changes.roles ? clubMemberRoles(changes.roles) : null;
    if (nextRoles) {
      const problem = lastAdminProblem(actor, club.members, userId, nextRoles);
      if (problem) throw new BusinessRuleViolation(problem, "last_club_admin");
    }
    if (changes.isActive === false && user.isActive && userId === actor.userId) {
      throw new BusinessRuleViolation("You can't deactivate your own account.", "self_deactivate");
    }
    // Demoted or deactivated: the club keeps an active club admin.
    const stopsBeingAdmin = (nextRoles && !nextRoles.includes("CLUB_ADMIN")) || changes.isActive === false;
    if (stopsBeingAdmin && member.roles.includes("CLUB_ADMIN")) await keepsAnActiveAdmin(users, actor, club.members, userId);

    const contact = await contactFor(users, { email: changes.email, phone: changes.phone }, userId);
    const email = contact.email !== undefined ? contact.email : user.email;
    const phone = contact.phone !== undefined ? contact.phone : user.phone;
    if (!email && !phone) throw new BadRequest("An account needs an email or a phone number to sign in.", "contact_required");

    if (contact.email !== undefined || contact.phone !== undefined || changes.isActive !== undefined) {
      await users.updateAccount(userId, { ...contact, ...(changes.isActive !== undefined && { isActive: changes.isActive }) });
    }
    if (nextRoles) await users.setRoles(userId, nextRoles);
    if (name !== undefined) await this.deps.profiles.update(userId, { name });
    const updated = await users.findById(userId);
    if (!updated) throw new NotFound("This person isn't a member of the club.");
    return updated;
  }
}
