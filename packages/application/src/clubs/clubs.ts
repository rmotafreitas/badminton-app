import {
  accountShapeProblem,
  type Actor,
  rolesAfterLeavingClub,
  BusinessRuleViolation,
  type Club,
  type ClubWithMembers,
  Conflict,
  canManageClub,
  canViewClub,
  Forbidden,
  isObjectId,
  isSystemAdmin,
  NotFound,
} from "@bb/domain";
import type { UserRepository } from "@/identity";
import { type ImageProcessor, type ImageUpload, processUpload } from "@/shared";
import type { ClubRepository } from "./ports";

export interface ClubInput {
  readonly name?: string;
  readonly location?: string | null;
  readonly picture?: ImageUpload;
  readonly banner?: ImageUpload;
}

const cleanName = (name: string) => {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) throw new BusinessRuleViolation("A club name has 2 to 80 characters.");
  return trimmed;
};

async function applyImages(clubs: ClubRepository, images: ImageProcessor, id: string, input: ClubInput) {
  for (const kind of ["picture", "banner"] as const) {
    const upload = input[kind];
    if (upload) await clubs.setImage(id, kind, await processUpload(images, upload, kind === "picture" ? "square" : "banner"));
  }
}

interface Deps {
  readonly clubs: ClubRepository;
  readonly users: UserRepository;
  readonly images: ImageProcessor;
}

/** One club and its roster. Members and system admins only; anyone else gets NotFound. */
export class GetClub {
  constructor(private readonly deps: Pick<Deps, "clubs">) {}
  async execute({ actor, clubId }: { actor: Actor; clubId: string }): Promise<ClubWithMembers> {
    if (!isObjectId(clubId) || !canViewClub(actor, clubId)) throw new NotFound("Club not found.");
    const club = await this.deps.clubs.findWithMembers(clubId);
    if (!club) throw new NotFound("Club not found.");
    return club;
  }
}

export class ListClubs {
  constructor(private readonly deps: Pick<Deps, "clubs">) {}
  async execute({ actor }: { actor: Actor }): Promise<Club[]> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    return this.deps.clubs.listAll();
  }
}

export class CreateClub {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, input }: { actor: Actor; input: ClubInput & { name: string } }): Promise<Club> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    const club = await this.deps.clubs.create({ name: cleanName(input.name), location: input.location?.trim() || null });
    await applyImages(this.deps.clubs, this.deps.images, club.id, input);
    return (await this.deps.clubs.findById(club.id)) ?? club;
  }
}

/** Club admins edit their own club; system admins any club. */
export class UpdateClub {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId, input }: { actor: Actor; clubId: string; input: ClubInput }): Promise<Club> {
    if (!isObjectId(clubId)) throw new NotFound("Club not found.");
    if (!canManageClub(actor, clubId)) throw canViewClub(actor, clubId) ? new Forbidden() : new NotFound("Club not found.");
    if (!(await this.deps.clubs.findById(clubId))) throw new NotFound("Club not found.");
    await this.deps.clubs.update(clubId, {
      ...(input.name !== undefined && { name: cleanName(input.name) }),
      ...(input.location !== undefined && { location: input.location?.trim() || null }),
    });
    await applyImages(this.deps.clubs, this.deps.images, clubId, input);
    const updated = await this.deps.clubs.findById(clubId);
    if (!updated) throw new NotFound("Club not found.");
    return updated;
  }
}

/** A club with recorded games can't be deleted (games need their club); its members are moved out first. */
export class DeleteClub {
  constructor(private readonly deps: Pick<Deps, "clubs" | "users">) {}
  async execute({ actor, clubId }: { actor: Actor; clubId: string }): Promise<void> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    if (!isObjectId(clubId) || !(await this.deps.clubs.findById(clubId))) throw new NotFound("Club not found.");
    if ((await this.deps.clubs.countGames(clubId)) > 0) {
      throw new Conflict("This club has recorded games, so it can't be deleted.", "club_has_games");
    }
    await this.deps.users.clearClub(clubId);
    await this.deps.clubs.delete(clubId);
  }
}

export class AssignUserToClub {
  constructor(private readonly deps: Pick<Deps, "clubs" | "users">) {}
  async execute({ actor, userId, clubId }: { actor: Actor; userId: string; clubId: string | null }): Promise<void> {
    if (!isSystemAdmin(actor)) throw new Forbidden();
    const user = isObjectId(userId) ? await this.deps.users.findById(userId) : null;
    if (!user) throw new NotFound("User not found.");
    if (clubId !== null && (!isObjectId(clubId) || !(await this.deps.clubs.findById(clubId)))) {
      throw new NotFound("Club not found.");
    }
    const shape = accountShapeProblem(user.roles, clubId);
    if (shape) throw new BusinessRuleViolation(shape, "system_admin_no_club");
    if (clubId === user.clubId) return;
    await this.deps.users.setClub(userId, clubId);
    // Club roles belong to the old club: someone moved arrives as a player.
    if (!isSystemAdmin(user)) await this.deps.users.setRoles(userId, rolesAfterLeavingClub(user.roles));
  }
}
