import {
  type Actor,
  BusinessRuleViolation,
  type Club,
  canManageRegistrations,
  canSeePersonalDetails,
  Conflict,
  DEFAULT_REGISTRATION_FORM,
  EMPTY_PERSON,
  Forbidden,
  isObjectId,
  NotFound,
  type PersonalDetails,
  type Registration,
  REGISTRATION_CATEGORIES,
  type RegistrationCategory,
  type RegistrationForm,
  SIGNED_FILE_MAX_BYTES,
  SIGNED_FILE_TYPES,
  type User,
} from "@bb/domain";
import type { ClubRepository } from "@/clubs";
import type { UserRepository } from "@/identity";
import type { ProfileRepository } from "@/profiles";
import type { Clock, ObjectStorage } from "@/shared";
import type { MemberDetailsRepository, RegistrationFormRepository, RegistrationRepository } from "./ports";

interface Deps {
  readonly users: UserRepository;
  readonly clubs: Pick<ClubRepository, "findById" | "findWithMembers">;
  readonly profiles: Pick<ProfileRepository, "findPlayer">;
  readonly details: MemberDetailsRepository;
  readonly forms: RegistrationFormRepository;
  readonly registrations: RegistrationRepository;
  readonly storage: ObjectStorage;
  readonly clock: Clock;
}

// ── Validation ───────────────────────────────────────────────────────────────

const bad = (message: string) => new BusinessRuleViolation(message, "invalid_details");

function text(value: string | null | undefined, max: number, label: string): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max) throw bad(`${label}: at most ${max} characters.`);
  return trimmed || null;
}

function day(value: string | null | undefined, label: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw bad(`${label}: use a valid date.`);
  return v;
}

/** Portuguese formats, loosely: anything else is very likely a typo the club would have to chase. */
export function cleanPerson(input: Partial<PersonalDetails>): PersonalDetails {
  const postalCode = text(input.postalCode, 8, "Postal code");
  if (postalCode && !/^\d{4}-\d{3}$/.test(postalCode)) throw bad("Postal code: use 0000-000.");
  const nif = text(input.nif?.replace(/\s/g, ""), 9, "NIF");
  if (nif && !/^\d{9}$/.test(nif)) throw bad("NIF: 9 digits.");
  const email = text(input.email, 200, "Email")?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Email: that doesn't look right.");
  if (input.sex && input.sex !== "M" && input.sex !== "F") throw bad("Sex: M or F.");
  return {
    fullName: text(input.fullName, 120, "Name"),
    sex: input.sex ?? null,
    birthday: day(input.birthday, "Birthday"),
    nationality: text(input.nationality, 60, "Nationality"),
    address: text(input.address, 160, "Address"),
    locality: text(input.locality, 80, "Locality"),
    municipality: text(input.municipality, 80, "Municipality"),
    postalCode,
    idNumber: text(input.idNumber, 30, "ID number"),
    idValidUntil: day(input.idValidUntil, "ID valid until"),
    nif,
    phone: text(input.phone, 30, "Phone"),
    email,
    profession: text(input.profession, 80, "Profession"),
  };
}

const cleanCategories = (categories: readonly string[]): RegistrationCategory[] => {
  const valid = [...new Set(categories)].filter((c): c is RegistrationCategory => (REGISTRATION_CATEGORIES as readonly string[]).includes(c));
  if (valid.length !== new Set(categories).size) throw bad("Unknown category.");
  return valid;
};

export function cleanForm(input: RegistrationForm): RegistrationForm {
  const season = text(input.season, 20, "Season");
  if (!season) throw bad("Season: required.");
  if (!Number.isFinite(input.feeEuros) || input.feeEuros < 0 || input.feeEuros > 10_000) throw bad("Fee: 0 to 10 000 €.");
  return {
    season,
    feeEuros: Math.round(input.feeEuros * 100) / 100,
    declaration: text(input.declaration, 4000, "Declaration") ?? "",
    footer: text(input.footer, 600, "Footer") ?? "",
  };
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function memberOf(deps: Deps, actor: Actor, userId: string): Promise<User> {
  const user = isObjectId(userId) ? await deps.users.findById(userId) : null;
  // Someone you may not see the details of doesn't exist, as far as you're concerned.
  if (!user || !canSeePersonalDetails(actor, { userId: user.id, clubId: user.clubId })) throw new NotFound("Member not found.");
  return user;
}

async function clubOf(deps: Deps, user: User): Promise<Club> {
  const club = user.clubId ? await deps.clubs.findById(user.clubId) : null;
  if (!club) throw new BusinessRuleViolation("Join a club first: the form is the club's.", "no_club");
  return club;
}

const formOf = async (deps: Deps, clubId: string) => (await deps.forms.find(clubId)) ?? DEFAULT_REGISTRATION_FORM;

async function registrationFor(deps: Deps, actor: Actor, id: string, mode: "view" | "manage"): Promise<Registration> {
  const registration = isObjectId(id) ? await deps.registrations.findById(id) : null;
  if (!registration) throw new NotFound("Registration not found.");
  const manager = canManageRegistrations(actor, registration.clubId);
  if (manager || (mode === "view" && registration.userId === actor.userId)) return registration;
  throw registration.userId === actor.userId ? new Forbidden() : new NotFound("Registration not found.");
}

export interface RegistrationSheet {
  readonly user: User;
  readonly club: Club;
  readonly form: RegistrationForm;
  /** Stored details, with the gaps filled from the profile and account (name, sex, birthday, phone, email). */
  readonly person: PersonalDetails;
  readonly nib: string | null;
  readonly guardian: PersonalDetails | null;
  /** True when the person had stored anything (the rest is just pre-filled from the profile). */
  readonly hasStoredDetails: boolean;
  readonly registration: Registration | null;
  readonly canManage: boolean;
  readonly storageConfigured: boolean;
}

/** Everything the form needs for one member: theirs to see, or their club admin's. */
export class GetRegistrationSheet {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, userId }: { actor: Actor; userId?: string }): Promise<RegistrationSheet> {
    const user = await memberOf(this.deps, actor, userId ?? actor.userId);
    const club = await clubOf(this.deps, user);
    const [form, stored, profile] = await Promise.all([formOf(this.deps, club.id), this.deps.details.find(user.id), this.deps.profiles.findPlayer(user.id)]);
    const own = stored?.person ?? EMPTY_PERSON;
    const profileSex = profile?.sex === "M" || profile?.sex === "F" ? profile.sex : null;
    const person: PersonalDetails = {
      ...own,
      fullName: own.fullName ?? (profile?.name || user.name || null),
      sex: own.sex ?? profileSex,
      birthday: own.birthday ?? (profile?.birthday ? profile.birthday.toISOString().slice(0, 10) : null),
      phone: own.phone ?? user.phone,
      email: own.email ?? user.email,
    };
    return {
      user,
      club,
      form,
      person,
      nib: stored?.nib ?? null,
      guardian: stored?.guardian ?? null,
      hasStoredDetails: !!stored,
      registration: await this.deps.registrations.find(user.id, club.id, form.season),
      canManage: canManageRegistrations(actor, club.id),
      storageConfigured: this.deps.storage.configured,
    };
  }
}

/** The member keeps their own details; their club admin may correct them. */
export class SaveMemberDetails {
  constructor(private readonly deps: Deps) {}
  async execute({
    actor,
    userId,
    input,
  }: {
    actor: Actor;
    userId?: string;
    input: { person: Partial<PersonalDetails>; nib?: string | null; guardian?: Partial<PersonalDetails> | null };
  }) {
    const user = await memberOf(this.deps, actor, userId ?? actor.userId);
    if (user.id !== actor.userId && !canManageRegistrations(actor, user.clubId ?? "")) throw new Forbidden();
    const guardian = input.guardian ? cleanPerson(input.guardian) : null;
    const emptyGuardian = guardian && Object.values(guardian).every((v) => v === null);
    return this.deps.details.save(user.id, {
      person: cleanPerson(input.person),
      nib: text(input.nib?.replace(/\s/g, ""), 34, "NIB/IBAN"),
      guardian: emptyGuardian ? null : guardian,
    });
  }
}

/** The right to erasure for one's own details. Registrations the club already holds stay (its records). */
export class EraseMyDetails {
  constructor(private readonly deps: Pick<Deps, "details">) {}
  execute({ actor }: { actor: Actor }) {
    return this.deps.details.erase(actor.userId);
  }
}

/**
 * Creates (or updates) this season's registration when the form is printed, so the club admin sees it's coming.
 * Categories can change until it's approved.
 */
export class PrepareRegistration {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, userId, categories }: { actor: Actor; userId?: string; categories: readonly string[] }): Promise<Registration> {
    const user = await memberOf(this.deps, actor, userId ?? actor.userId);
    if (user.id !== actor.userId && !canManageRegistrations(actor, user.clubId ?? "")) throw new Forbidden();
    const club = await clubOf(this.deps, user);
    const form = await formOf(this.deps, club.id);
    const clean = cleanCategories(categories);
    if (clean.length === 0) throw bad("Tick at least one box (athlete, training, practitioner or member).");
    const existing = await this.deps.registrations.find(user.id, club.id, form.season);
    if (!existing) return this.deps.registrations.create({ userId: user.id, clubId: club.id, season: form.season, categories: clean });
    if (existing.approvedAt) {
      if (JSON.stringify([...existing.categories].sort()) === JSON.stringify([...clean].sort())) return existing;
      throw new Conflict("This season's registration is already approved.", "registration_approved");
    }
    return this.deps.registrations.update(existing.id, { categories: clean });
  }
}

export interface ClubRegistrationRow {
  readonly member: { id: string; name: string | null; email: string | null; photoVersion: string | null };
  readonly registration: Registration | null;
}

/** The club admin's season list: every member, with their registration if there is one. */
export class ListClubRegistrations {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId }: { actor: Actor; clubId: string }) {
    if (!isObjectId(clubId) || !canManageRegistrations(actor, clubId)) throw new NotFound("Club not found.");
    const club = await this.deps.clubs.findWithMembers(clubId);
    if (!club) throw new NotFound("Club not found.");
    const form = await formOf(this.deps, clubId);
    const registrations = new Map((await this.deps.registrations.listByClub(clubId, form.season)).map((r) => [r.userId, r]));
    const rows: ClubRegistrationRow[] = club.members.map((m) => ({
      member: { id: m.id, name: m.name, email: m.email, photoVersion: m.photoVersion },
      registration: registrations.get(m.id) ?? null,
    }));
    return { season: form.season, storageConfigured: this.deps.storage.configured, rows };
  }
}

/**
 * The club's side of the form: signed paper received, approved ("Aprovado em"), notes ("Obs"). Approving needs the
 * signed form; un-ticking "received" also withdraws the approval.
 */
export class UpdateRegistration {
  constructor(private readonly deps: Deps) {}
  async execute({
    actor,
    id,
    changes,
  }: {
    actor: Actor;
    id: string;
    changes: { signedReceived?: boolean; approved?: boolean; notes?: string | null };
  }): Promise<Registration> {
    const registration = await registrationFor(this.deps, actor, id, "manage");
    const received = changes.signedReceived ?? registration.signedReceived;
    const approved = received && (changes.approved ?? !!registration.approvedAt);
    if (changes.approved && !received) throw new BusinessRuleViolation("Record the signed form first.", "not_signed");
    const now = this.deps.clock.now();
    return this.deps.registrations.update(id, {
      signedReceived: received,
      approvedAt: approved ? (registration.approvedAt ?? now) : null,
      approvedById: approved ? (registration.approvedById ?? actor.userId) : null,
      ...(changes.notes !== undefined && { notes: text(changes.notes, 500, "Notes") }),
    });
  }
}

const fileKeyPrefix = (r: Registration) => `registrations/${r.clubId}/${r.id}/`;
const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

/** A presigned upload for the signed scan (browser → bucket directly: no serverless body limit). */
export class RequestSignedUpload {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, id, contentType, bytes }: { actor: Actor; id: string; contentType: string; bytes: number }) {
    const registration = await registrationFor(this.deps, actor, id, "manage");
    if (!this.deps.storage.configured) throw new Conflict("File storage isn't set up yet: tick “signed form received” instead.", "storage_unavailable");
    if (!(SIGNED_FILE_TYPES as readonly string[]).includes(contentType)) throw new BusinessRuleViolation("Upload a PDF or a photo.", "bad_file_type");
    if (!(bytes > 0) || bytes > SIGNED_FILE_MAX_BYTES) throw new BusinessRuleViolation("The file is too big (20 MB at most).", "file_too_big");
    const key = `${fileKeyPrefix(registration)}signed-${this.deps.clock.now().getTime()}.${EXTENSIONS[contentType]}`;
    return { key, url: await this.deps.storage.presignPut(key, contentType, 15 * 60), contentType };
  }
}

/** After the upload: the scan replaces any earlier one, and the signed form counts as received. */
export class CompleteSignedUpload {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, id, key, contentType }: { actor: Actor; id: string; key: string; contentType: string }): Promise<Registration> {
    const registration = await registrationFor(this.deps, actor, id, "manage");
    if (!key.startsWith(fileKeyPrefix(registration)) || key.includes("..")) throw new BusinessRuleViolation("Invalid key.");
    if (!(SIGNED_FILE_TYPES as readonly string[]).includes(contentType)) throw new BusinessRuleViolation("Upload a PDF or a photo.", "bad_file_type");
    if (registration.signedFileKey && registration.signedFileKey !== key) await this.deps.storage.delete(registration.signedFileKey);
    return this.deps.registrations.update(id, { signedFileKey: key, signedFileType: contentType, signedReceived: true });
  }
}

/** A short-lived link to the scan: the member and the club's admins. */
export class GetSignedFileUrl {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, id }: { actor: Actor; id: string }) {
    const registration = await registrationFor(this.deps, actor, id, "view");
    if (!registration.signedFileKey) throw new NotFound("No scan uploaded.");
    return { url: await this.deps.storage.presignGet(registration.signedFileKey, 10 * 60), contentType: registration.signedFileType };
  }
}

export class RemoveSignedFile {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, id }: { actor: Actor; id: string }): Promise<Registration> {
    const registration = await registrationFor(this.deps, actor, id, "manage");
    if (registration.signedFileKey) await this.deps.storage.delete(registration.signedFileKey);
    return this.deps.registrations.update(id, { signedFileKey: null, signedFileType: null });
  }
}

export class DeleteRegistration {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, id }: { actor: Actor; id: string }): Promise<void> {
    const registration = await registrationFor(this.deps, actor, id, "manage");
    if (registration.signedFileKey) await this.deps.storage.delete(registration.signedFileKey);
    await this.deps.registrations.delete(id);
  }
}

/** The club's form text. Members read it through their sheet; admins edit it here. */
export class GetRegistrationForm {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId }: { actor: Actor; clubId: string }) {
    if (!isObjectId(clubId) || !canManageRegistrations(actor, clubId)) throw new NotFound("Club not found.");
    return formOf(this.deps, clubId);
  }
}

export class UpdateRegistrationForm {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, clubId, form }: { actor: Actor; clubId: string; form: RegistrationForm }): Promise<RegistrationForm> {
    if (!isObjectId(clubId) || !canManageRegistrations(actor, clubId)) throw new NotFound("Club not found.");
    if (!(await this.deps.clubs.findById(clubId))) throw new NotFound("Club not found.");
    const clean = cleanForm(form);
    await this.deps.forms.save(clubId, clean);
    return clean;
  }
}
