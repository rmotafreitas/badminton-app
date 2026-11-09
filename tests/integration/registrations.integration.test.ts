import { beforeAll, describe, expect, it } from "bun:test";
import { EMPTY_PERSON } from "@bb/domain";
import {
  PrismaMemberDetailsRepository,
  PrismaRegistrationFormRepository,
  PrismaRegistrationRepository,
  PrismaUserRepository,
} from "@bb/infrastructure";
import type { PrismaClient } from "@prisma/client";
import { useIsolatedDatabase } from "./support";

const isolated = useIsolatedDatabase();
let db: PrismaClient;
beforeAll(() => {
  db = isolated.db;
});

describe("registration repositories", () => {
  it("store details with a guardian, update them, and erase them", async () => {
    const user = await db.user.create({ data: { email: "d@test.pt" } });
    const details = new PrismaMemberDetailsRepository(db);
    expect(await details.find(user.id)).toBeNull();
    await details.save(user.id, { person: { ...EMPTY_PERSON, nif: "255402015", postalCode: "4405-663" }, nib: null, guardian: null });
    const saved = await details.save(user.id, {
      person: { ...EMPTY_PERSON, nif: "255402015", locality: "Gaia" },
      nib: "PT50000000000000000000000",
      guardian: { ...EMPTY_PERSON, fullName: "Mãe" },
    });
    expect(saved).toMatchObject({ nib: "PT50000000000000000000000", person: { nif: "255402015", locality: "Gaia", postalCode: null }, guardian: { fullName: "Mãe", nif: null } });
    await details.erase(user.id);
    expect(await details.find(user.id)).toBeNull();
  });

  it("keep the club's form on the club, and one registration per member, club and season", async () => {
    const club = await db.club.create({ data: { name: "CFBG" } });
    const user = await db.user.create({ data: { email: "r@test.pt", clubId: club.id } });
    const forms = new PrismaRegistrationFormRepository(db);
    expect(await forms.find(club.id)).toBeNull();
    await forms.save(club.id, { season: "2025", feeEuros: 17.5, declaration: "Declaro {fee}", footer: "NIF: 1" });
    expect(await forms.find(club.id)).toEqual({ season: "2025", feeEuros: 17.5, declaration: "Declaro {fee}", footer: "NIF: 1" });

    const registrations = new PrismaRegistrationRepository(db);
    const r = await registrations.create({ userId: user.id, clubId: club.id, season: "2025", categories: ["SOCIO"] });
    await expect(registrations.create({ userId: user.id, clubId: club.id, season: "2025", categories: ["ATLETA"] })).rejects.toThrow();
    const updated = await registrations.update(r.id, { categories: ["ATLETA", "SOCIO"], signedReceived: true, approvedAt: new Date("2025-09-01T00:00:00Z") });
    expect(updated).toMatchObject({ categories: ["ATLETA", "SOCIO"], signedReceived: true });
    expect((await registrations.find(user.id, club.id, "2025"))?.id).toBe(r.id);
    expect(await registrations.listByClub(club.id, "2025")).toHaveLength(1);
    expect(await registrations.listByClub(club.id, "2024")).toHaveLength(0);

    // Deleting the account takes its details and registrations with it.
    await new PrismaMemberDetailsRepository(db).save(user.id, { person: EMPTY_PERSON, nib: null, guardian: null });
    await new PrismaUserRepository(db).delete(user.id);
    expect(await db.registration.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.memberDetails.count({ where: { userId: user.id } })).toBe(0);
  });
});
