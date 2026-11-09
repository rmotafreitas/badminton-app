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
  nextMemberRoles,
  type Role,
  rolesAfterLeavingClub,
  type User,
} from "@bb/domain";
import { cleanPersonName, contactFor, normalizeEmail, normalizePhone, type UserRepository } from "@/identity";
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
          roles: nextMemberRoles(actor, [], input.roles ?? []),
          clubId,
        });
      }
    }
    if (user.clubId === clubId) throw new Conflict("Already a member of this club.", "already_member");
    if (user.clubId && !isSystemAdmin(actor)) {
      throw new Conflict("This person belongs to another club. Ask a system admin to move them.", "in_other_club");
    }
    await users.setClub(user.id, clubId);
    // Club roles from a previous club don't carry over.
    await users.setRoles(user.id, rolesAfterLeavingClub(user.roles));
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
    await this.deps.users.setClub(userId, null);
    await this.deps.users.setRoles(userId, rolesAfterLeavingClub(member.roles));
  }
}

/** Club admin, coach or player. Only a system admin can grant or remove SYSTEM_ADMIN. */
export class SetMemberRoles {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId, userId, roles }: { actor: Actor; clubId: string; userId: string; roles: readonly Role[] }): Promise<Role[]> {
    const club = await managedClub(this.deps, actor, clubId);
    const member = memberOf(club.members, userId);
    const next = nextMemberRoles(actor, member.roles, roles);
    if (userId === actor.userId && member.roles.includes("SYSTEM_ADMIN") && !next.includes("SYSTEM_ADMIN")) {
      throw new BusinessRuleViolation("You can't remove your own admin role.", "self_demote");
    }
    const problem = lastAdminProblem(actor, club.members, userId, next);
    if (problem) throw new BusinessRuleViolation(problem, "last_club_admin");
    await this.deps.users.setRoles(userId, next);
    return next;
  }
}
