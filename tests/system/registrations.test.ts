import { describe, expect, it } from "bun:test";
import { testApi } from "../support";

function world(options: { storageConfigured?: boolean } = {}) {
  const api = testApi(options);
  const club = api.store.addClub("Clube Badminton Gaia");
  const other = api.store.addClub("Other");
  const admin = api.store.addUser({ name: "Clara", email: "clara@test.pt", roles: ["CLUB_ADMIN", "PLAYER"], clubId: club.id });
  const coach = api.store.addUser({ name: "Carla", email: "carla@test.pt", roles: ["COACH", "PLAYER"], clubId: club.id });
  const ricardo = api.store.addUser({ name: "Ricardo Freitas", email: "ricardo@test.pt", phone: "967083100", clubId: club.id });
  const ana = api.store.addUser({ name: "Ana", email: "ana@test.pt", clubId: club.id });
  const otherAdmin = api.store.addUser({ name: "Zé", roles: ["CLUB_ADMIN"], clubId: other.id });
  const root = api.store.addUser({ name: "Root", roles: ["SYSTEM_ADMIN"] });
  return { api, club, other, admin, coach, ricardo, ana, otherAdmin, root };
}

const details = {
  person: {
    fullName: "Ricardo Freitas",
    sex: "M" as const,
    birthday: "2004-12-04",
    nationality: "Portuguesa",
    address: "Rua das Marinhas 59 M19",
    locality: "Porto Gaia",
    municipality: "Vila Nova de Gaia",
    postalCode: "4405-663",
    idNumber: "30748394",
    idValidUntil: "2026-10-27",
    nif: "255402015",
    profession: "Estudante",
  },
};

describe("registration details", () => {
  it("start pre-filled from the profile, then are saved privately", async () => {
    const w = world();
    const me = w.api.as(w.ricardo);
    const before = (await me.registrations.me.get()).data!;
    expect(before.person).toMatchObject({ fullName: "Ricardo Freitas", email: "ricardo@test.pt", phone: "967083100", nif: null });
    expect(before.hasStoredDetails).toBe(false);
    expect(before.form.season).toBe("2024");
    expect(before.club.name).toBe("Clube Badminton Gaia");

    const saved = (await me.registrations.me.details.put(details)).data!;
    // (The test client turns ISO-looking strings into Dates; the web app's client doesn't.)
    const { birthday, idValidUntil, ...rest } = details.person;
    expect(saved.person).toMatchObject({ ...rest, email: "ricardo@test.pt" });
    expect(new Date(saved.person.birthday as unknown as string).toISOString().slice(0, 10)).toBe(birthday);
    expect(new Date(saved.person.idValidUntil as unknown as string).toISOString().slice(0, 10)).toBe(idValidUntil);
    expect(saved.hasStoredDetails).toBe(true);
  });

  it("refuses malformed postal codes and NIFs", async () => {
    const w = world();
    const me = w.api.as(w.ricardo);
    expect((await me.registrations.me.details.put({ person: { postalCode: "4405663" } })).status).toBe(422);
    expect((await me.registrations.me.details.put({ person: { nif: "1234" } })).status).toBe(422);
  });

  it("are visible to the person and their club admins only (not coaches, not other clubs)", async () => {
    const w = world();
    await w.api.as(w.ricardo).registrations.me.details.put(details);
    const view = (u: typeof w.admin) => w.api.as(u).registrations.members({ userId: w.ricardo.id }).get();
    expect((await view(w.admin)).data?.person.nif).toBe("255402015");
    expect((await view(w.root)).status).toBe(200);
    expect((await view(w.coach)).status).toBe(404);
    expect((await view(w.ana)).status).toBe(404);
    expect((await view(w.otherAdmin)).status).toBe(404);
  });

  it("a club admin may correct them; the person may erase them", async () => {
    const w = world();
    const me = w.api.as(w.ricardo);
    await me.registrations.me.details.put(details);
    const fixed = await w.api.as(w.admin).registrations.members({ userId: w.ricardo.id }).details.put({ ...details, person: { ...details.person, locality: "Gaia" } });
    expect(fixed.data?.person.locality).toBe("Gaia");
    expect((await me.registrations.me.details.delete()).status).toBe(204);
    expect((await me.registrations.me.get()).data).toMatchObject({ hasStoredDetails: false, person: { nif: null } });
  });

  it("keep a legal guardian for minors", async () => {
    const w = world();
    const res = await w.api.as(w.ricardo).registrations.me.details.put({ ...details, guardian: { fullName: "Mãe Freitas", nif: "123456789" } });
    expect(res.data?.guardian).toMatchObject({ fullName: "Mãe Freitas", nif: "123456789", address: null });
  });
});

describe("registrations", () => {
  it("printing creates this season's registration; the club admin records the signed paper and approves", async () => {
    const w = world();
    const me = w.api.as(w.ricardo);
    expect((await me.registrations.me.prepare.post({ categories: [] })).status).toBe(422);
    const prepared = (await me.registrations.me.prepare.post({ categories: ["FORMACAO"] })).data!;
    expect(prepared).toMatchObject({ season: "2024", categories: ["FORMACAO"], status: "pending" });
    // Printing again just updates the boxes.
    expect((await me.registrations.me.prepare.post({ categories: ["FORMACAO", "SOCIO"] })).data?.id).toBe(prepared.id);

    const club = w.api.as(w.admin);
    const list = (await club.registrations.clubs({ id: w.club.id }).get()).data!;
    expect(list.season).toBe("2024");
    expect(list.rows.find((r) => r.member.id === w.ricardo.id)?.registration?.status).toBe("pending");
    expect(list.rows.find((r) => r.member.id === w.ana.id)?.registration).toBeNull();

    // Approving needs the signed paper first.
    expect((await club.registrations({ id: prepared.id }).patch({ approved: true })).status).toBe(422);
    expect((await club.registrations({ id: prepared.id }).patch({ signedReceived: true })).data?.status).toBe("received");
    const approved = (await club.registrations({ id: prepared.id }).patch({ approved: true, notes: "Pago" })).data!;
    expect(approved).toMatchObject({ status: "approved", notes: "Pago" });
    expect(approved.approvedAt).not.toBeNull();
    // Once approved, the member can't change the boxes.
    expect((await me.registrations.me.prepare.post({ categories: ["ATLETA"] })).status).toBe(409);
    // Un-ticking "received" withdraws the approval.
    expect((await club.registrations({ id: prepared.id }).patch({ signedReceived: false })).data).toMatchObject({ status: "pending", approvedAt: null });
  });

  it("members and coaches can't record or approve; other clubs can't see the list", async () => {
    const w = world();
    const prepared = (await w.api.as(w.ricardo).registrations.me.prepare.post({ categories: ["SOCIO"] })).data!;
    expect((await w.api.as(w.ricardo).registrations({ id: prepared.id }).patch({ signedReceived: true })).status).toBe(403);
    expect((await w.api.as(w.coach).registrations({ id: prepared.id }).patch({ signedReceived: true })).status).toBe(404);
    expect((await w.api.as(w.coach).registrations.clubs({ id: w.club.id }).get()).status).toBe(404);
    expect((await w.api.as(w.otherAdmin).registrations.clubs({ id: w.club.id }).get()).status).toBe(404);
  });

  it("the club's form text sets the season and fee", async () => {
    const w = world();
    const club = w.api.as(w.admin);
    const form = (await club.registrations.clubs({ id: w.club.id }).form.get()).data!;
    expect(form.feeEuros).toBe(15);
    expect((await club.registrations.clubs({ id: w.club.id }).form.put({ ...form, season: "2025/2026", feeEuros: 20 })).status).toBe(200);
    expect((await w.api.as(w.ricardo).registrations.me.get()).data?.form).toMatchObject({ season: "2025/2026", feeEuros: 20 });
    const prepared = (await w.api.as(w.ricardo).registrations.me.prepare.post({ categories: ["ATLETA"] })).data!;
    expect(prepared.season).toBe("2025/2026");
    expect((await w.api.as(w.coach).registrations.clubs({ id: w.club.id }).form.put(form)).status).toBe(404);
  });

  it("without storage, scans can't be uploaded but the checkbox works", async () => {
    const w = world({ storageConfigured: false });
    const prepared = (await w.api.as(w.ricardo).registrations.me.prepare.post({ categories: ["SOCIO"] })).data!;
    expect((await w.api.as(w.ricardo).registrations.me.get()).data?.storageConfigured).toBe(false);
    const upload = await w.api.as(w.admin).registrations({ id: prepared.id }).signed.upload.post({ contentType: "application/pdf", bytes: 1000 });
    expect(upload.status).toBe(409);
    expect((await w.api.as(w.admin).registrations({ id: prepared.id }).patch({ signedReceived: true })).data?.status).toBe("received");
  });

  it("with storage, the club admin uploads a scan; it replaces the previous one; the member can open it", async () => {
    const w = world();
    const prepared = (await w.api.as(w.ricardo).registrations.me.prepare.post({ categories: ["SOCIO"] })).data!;
    const club = w.api.as(w.admin).registrations({ id: prepared.id });
    expect((await club.signed.upload.post({ contentType: "text/html", bytes: 10 })).status).toBe(422);
    expect((await w.api.as(w.ricardo).registrations({ id: prepared.id }).signed.upload.post({ contentType: "application/pdf", bytes: 10 })).status).toBe(403);

    const first = (await club.signed.upload.post({ contentType: "application/pdf", bytes: 1000 })).data!;
    expect(first.url).toContain(first.key);
    expect((await club.signed.complete.post({ key: "registrations/elsewhere/x.pdf", contentType: "application/pdf" })).status).toBe(422);
    const done = (await club.signed.complete.post({ key: first.key, contentType: "application/pdf" })).data!;
    expect(done).toMatchObject({ hasSignedFile: true, signedReceived: true, status: "received" });
    expect(JSON.stringify(done)).not.toContain(first.key);

    w.api.clock.advance(1000);
    const second = (await club.signed.upload.post({ contentType: "image/jpeg", bytes: 2000 })).data!;
    await club.signed.complete.post({ key: second.key, contentType: "image/jpeg" });
    expect(w.api.store.deletedObjects).toContain(first.key);

    const link = (await w.api.as(w.ricardo).registrations({ id: prepared.id }).signed.get()).data!;
    expect(link).toMatchObject({ contentType: "image/jpeg" });
    expect(link.url).toContain(second.key);
    expect((await w.api.as(w.ana).registrations({ id: prepared.id }).signed.get()).status).toBe(404);
  });

  it("deleting an account removes its signed scans from storage", async () => {
    const w = world();
    const newbie = w.api.store.addUser({ name: "New", email: "new@test.pt", clubId: w.club.id });
    const prepared = (await w.api.as(newbie).registrations.me.prepare.post({ categories: ["SOCIO"] })).data!;
    const club = w.api.as(w.admin).registrations({ id: prepared.id });
    const up = (await club.signed.upload.post({ contentType: "application/pdf", bytes: 10 })).data!;
    await club.signed.complete.post({ key: up.key, contentType: "application/pdf" });
    expect((await w.api.as(w.root).data({ table: "users" })({ id: newbie.id }).delete()).status).toBe(204);
    expect(w.api.store.deletedObjects).toContain(up.key);
    expect(w.api.store.registration.registrations.size).toBe(0);
  });
});
