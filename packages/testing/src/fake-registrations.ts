import type { MemberDetailsRepository, RegistrationFormRepository, RegistrationRepository } from "@bb/application";
import type { MemberDetails, Registration, RegistrationForm } from "@bb/domain";
import { type FakeStore, nextId } from "./fakes";

/** In-memory registration storage, sharing the fake store's clock. Kept on the store so tests can look inside. */
export interface RegistrationTables {
  details: Map<string, MemberDetails>;
  forms: Map<string, RegistrationForm>;
  registrations: Map<string, Registration>;
}

export function fakeRegistrationTables(): RegistrationTables {
  return { details: new Map(), forms: new Map(), registrations: new Map() };
}

export function fakeMemberDetails(store: FakeStore, tables: RegistrationTables): MemberDetailsRepository {
  return {
    find: async (userId) => tables.details.get(userId) ?? null,
    save: async (userId, details) => {
      const saved: MemberDetails = { userId, ...details, updatedAt: store.clock.now() };
      tables.details.set(userId, saved);
      return saved;
    },
    erase: async (userId) => {
      tables.details.delete(userId);
    },
  };
}

export function fakeRegistrationForms(tables: RegistrationTables): RegistrationFormRepository {
  return {
    find: async (clubId) => tables.forms.get(clubId) ?? null,
    save: async (clubId, form) => {
      tables.forms.set(clubId, form);
    },
  };
}

export function fakeRegistrations(store: FakeStore, tables: RegistrationTables): RegistrationRepository {
  const all = () => [...tables.registrations.values()];
  return {
    findById: async (id) => tables.registrations.get(id) ?? null,
    find: async (userId, clubId, season) => all().find((r) => r.userId === userId && r.clubId === clubId && r.season === season) ?? null,
    listByClub: async (clubId, season) => all().filter((r) => r.clubId === clubId && r.season === season),
    listByUser: async (userId) => all().filter((r) => r.userId === userId),
    create: async (input) => {
      const now = store.clock.now();
      const r: Registration = {
        id: nextId(),
        ...input,
        categories: [...input.categories],
        signedReceived: false,
        signedFileKey: null,
        signedFileType: null,
        approvedAt: null,
        approvedById: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };
      tables.registrations.set(r.id, r);
      return r;
    },
    update: async (id, patch) => {
      const r = { ...tables.registrations.get(id)!, ...patch, updatedAt: store.clock.now() } as Registration;
      tables.registrations.set(id, r);
      return r;
    },
    delete: async (id) => {
      tables.registrations.delete(id);
    },
  };
}
