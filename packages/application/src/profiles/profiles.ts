import { type Actor, BusinessRuleViolation, canSeeContactDetails, isObjectId, NotFound, type PlayerProfile } from "@bb/domain";
import { type ImageProcessor, type ImageUpload, processUpload } from "@/shared";
import type { ProfileChanges, ProfileRepository } from "./ports";

/** Email and phone are blanked unless the caller may see them (the person, admins, staff of their club). */
const redact = (actor: Actor, profile: PlayerProfile): PlayerProfile =>
  canSeeContactDetails(actor, profile) ? profile : { ...profile, email: null, phone: null };

export class GetProfile {
  constructor(private readonly deps: { profiles: ProfileRepository }) {}
  async execute({ actor, userId }: { actor: Actor; userId: string }): Promise<PlayerProfile> {
    const profile = isObjectId(userId) ? await this.deps.profiles.findPlayer(userId) : null;
    if (!profile) throw new NotFound("Profile not found.");
    return redact(actor, profile);
  }
}

export interface ProfileInput {
  readonly name?: string;
  /** YYYY-MM-DD, or null to clear. */
  readonly birthday?: string | null;
  readonly sex?: string | null;
  readonly bio?: string | null;
  readonly photo?: ImageUpload;
  readonly banner?: ImageUpload;
}

export class UpdateMyProfile {
  constructor(private readonly deps: { profiles: ProfileRepository; images: ImageProcessor }) {}

  async execute({ actor, input }: { actor: Actor; input: ProfileInput }): Promise<PlayerProfile> {
    const changes: { -readonly [K in keyof ProfileChanges]: ProfileChanges[K] } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 80) throw new BusinessRuleViolation("A name has 1 to 80 characters.");
      changes.name = name;
    }
    if (input.birthday !== undefined) {
      const birthday = input.birthday ? new Date(input.birthday) : null;
      if (birthday && Number.isNaN(birthday.getTime())) throw new BusinessRuleViolation("Enter a valid birthday.");
      changes.birthday = birthday;
    }
    if (input.sex !== undefined) changes.sex = input.sex || null;
    if (input.bio !== undefined) {
      if ((input.bio?.length ?? 0) > 500) throw new BusinessRuleViolation("A bio has at most 500 characters.");
      changes.bio = input.bio?.trim() || null;
    }
    if (Object.keys(changes).length > 0) await this.deps.profiles.update(actor.userId, changes);
    for (const kind of ["photo", "banner"] as const) {
      const upload = input[kind];
      if (upload) await this.deps.profiles.setImage(actor.userId, kind, await processUpload(this.deps.images, upload, kind === "photo" ? "square" : "banner"));
    }
    const profile = await this.deps.profiles.findPlayer(actor.userId);
    if (!profile) throw new NotFound("Profile not found.");
    return profile;
  }
}
