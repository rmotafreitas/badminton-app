import type { MemberDetailsRepository, RegistrationFormRepository, RegistrationPatch, RegistrationRepository } from "@bb/application";
import {
  isObjectId,
  type MemberDetails,
  type PersonalDetails,
  type Registration,
  type RegistrationCategory,
  type RegistrationForm,
} from "@bb/domain";
import type { Prisma, Registration as RegistrationRow } from "@prisma/client";
import type { Database } from "@/shared/database";

type PersonRow = Prisma.MemberDetailsGetPayload<object>["person"];

const toPerson = (p: PersonRow): PersonalDetails => ({
  fullName: p.fullName ?? null,
  sex: p.sex === "M" || p.sex === "F" ? p.sex : null,
  birthday: p.birthday ?? null,
  nationality: p.nationality ?? null,
  address: p.address ?? null,
  locality: p.locality ?? null,
  municipality: p.municipality ?? null,
  postalCode: p.postalCode ?? null,
  idNumber: p.idNumber ?? null,
  idValidUntil: p.idValidUntil ?? null,
  nif: p.nif ?? null,
  phone: p.phone ?? null,
  email: p.email ?? null,
  profession: p.profession ?? null,
});

export class PrismaMemberDetailsRepository implements MemberDetailsRepository {
  constructor(private readonly db: Database) {}

  async find(userId: string): Promise<MemberDetails | null> {
    if (!isObjectId(userId)) return null;
    const row = await this.db.memberDetails.findUnique({ where: { userId } });
    return row ? { userId: row.userId, person: toPerson(row.person), nib: row.nib, guardian: row.guardian ? toPerson(row.guardian) : null, updatedAt: row.updatedAt } : null;
  }

  async save(userId: string, details: { person: PersonalDetails; nib: string | null; guardian: PersonalDetails | null }): Promise<MemberDetails> {
    const data = { person: { ...details.person }, nib: details.nib, guardian: details.guardian ? { ...details.guardian } : null };
    await this.db.memberDetails.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return (await this.find(userId)) as MemberDetails;
  }

  async erase(userId: string): Promise<void> {
    if (!isObjectId(userId)) return;
    await this.db.memberDetails.deleteMany({ where: { userId } });
  }
}

export class PrismaRegistrationFormRepository implements RegistrationFormRepository {
  constructor(private readonly db: Database) {}

  async find(clubId: string): Promise<RegistrationForm | null> {
    if (!isObjectId(clubId)) return null;
    const row = await this.db.club.findUnique({ where: { id: clubId }, select: { registrationForm: true } });
    const form = row?.registrationForm as Partial<RegistrationForm> | null | undefined;
    if (!form || typeof form.season !== "string") return null;
    return { season: form.season, feeEuros: Number(form.feeEuros ?? 0), declaration: String(form.declaration ?? ""), footer: String(form.footer ?? "") };
  }

  async save(clubId: string, form: RegistrationForm): Promise<void> {
    await this.db.club.update({ where: { id: clubId }, data: { registrationForm: { ...form } } });
  }
}

const toRegistration = (r: RegistrationRow): Registration => ({
  id: r.id,
  userId: r.userId,
  clubId: r.clubId,
  season: r.season,
  categories: r.categories as RegistrationCategory[],
  signedReceived: r.signedReceived,
  signedFileKey: r.signedFileKey,
  signedFileType: r.signedFileType,
  approvedAt: r.approvedAt,
  approvedById: r.approvedById,
  notes: r.notes,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export class PrismaRegistrationRepository implements RegistrationRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Registration | null> {
    if (!isObjectId(id)) return null;
    const row = await this.db.registration.findUnique({ where: { id } });
    return row ? toRegistration(row) : null;
  }

  async find(userId: string, clubId: string, season: string): Promise<Registration | null> {
    if (!isObjectId(userId) || !isObjectId(clubId)) return null;
    const row = await this.db.registration.findUnique({ where: { userId_clubId_season: { userId, clubId, season } } });
    return row ? toRegistration(row) : null;
  }

  async listByClub(clubId: string, season: string): Promise<Registration[]> {
    if (!isObjectId(clubId)) return [];
    return (await this.db.registration.findMany({ where: { clubId, season } })).map(toRegistration);
  }

  async listByUser(userId: string): Promise<Registration[]> {
    if (!isObjectId(userId)) return [];
    return (await this.db.registration.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })).map(toRegistration);
  }

  async create(input: { userId: string; clubId: string; season: string; categories: readonly RegistrationCategory[] }): Promise<Registration> {
    return toRegistration(await this.db.registration.create({ data: { ...input, categories: [...input.categories] } }));
  }

  async update(id: string, patch: RegistrationPatch): Promise<Registration> {
    const { categories, ...rest } = patch;
    const data = { ...rest, ...(categories && { categories: [...categories] }) };
    return toRegistration(await this.db.registration.update({ where: { id }, data }));
  }

  async delete(id: string): Promise<void> {
    await this.db.registration.deleteMany({ where: { id } });
  }
}
