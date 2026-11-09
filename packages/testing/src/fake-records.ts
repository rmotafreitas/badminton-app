import { type RecordRow, type RecordStore, type RecordValue, type TableKey, tableDef } from "@bb/application";
import type { FakeStore } from "./fakes";

type Values = Record<string, RecordValue>;

/** Each table's rows, built from the shared fake store (sign-in methods and rate limits aren't modelled: empty). */
function rowsOf(store: FakeStore, table: TableKey): RecordRow[] {
  const rows = (items: Iterable<{ id: string } & object>, map: (item: never) => Values) =>
    [...items].map((item) => ({ id: item.id, values: map(item as never) }));
  switch (table) {
    case "clubs":
      return rows(store.clubs.values(), (c: ReturnType<FakeStore["addClub"]>) => ({
        name: c.name,
        location: c.location,
        picture: c.pictureVersion,
        banner: c.bannerVersion,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    case "users":
      return [...store.users.values()].map((u) => {
        const p = store.profiles.get(u.id);
        return {
          id: u.id,
          values: {
            photo: p?.photoVersion ?? null,
            name: p?.name || null,
            email: u.email,
            phone: u.phone,
            roles: [...u.roles],
            clubId: u.clubId,
            eloSingles: u.eloSingles,
            eloDoubles: u.eloDoubles,
            isActive: u.isActive,
            lastAccess: u.lastAccess,
            createdAt: u.createdAt,
          },
        };
      });
    case "games":
      return [...store.games.values()].map((g) => ({
        id: g.id,
        values: { ...g, team1PlayerIds: [...g.team1PlayerIds], team2PlayerIds: [...g.team2PlayerIds], sets: [...g.sets] },
      }));
    case "trainingReviews":
      return [...store.reviews.values()].map((r) => ({ id: r.id, values: { userId: r.userId, date: r.date, effort: r.effort, note: r.note, createdAt: r.createdAt } }));
    case "rallySessions":
      return [...store.rally.values()].map((s) => ({
        id: s.id,
        values: {
          title: s.title,
          ownerId: s.ownerId,
          recordedAt: s.recordedAt,
          durationS: s.durationS,
          status: s.status,
          format: s.format,
          gameId: s.gameId,
          pinned: s.pinned,
          videoBytes: s.videoBytes,
          videoExpiresAt: s.videoExpiresAt,
          shareForTraining: s.shareForTraining,
          createdAt: s.createdAt,
        },
      }));
    case "authSessions":
      return [...store.sessions.values()].map((s) => ({ id: s.id, values: { userId: s.userId, userAgent: null, expiresAt: s.expiresAt, createdAt: null } }));
    case "signInCodes":
      return [...store.challenges.values()].map((c) => ({ id: c.id, values: { target: c.target, type: c.kind, used: c.used, expiresAt: c.expiresAt, createdAt: null } }));
    case "authMethods":
    case "rateLimits":
      return [];
  }
}

const comparable = (v: RecordValue | undefined) => (v instanceof Date ? v.getTime() : v);

/** The Prisma store's behaviour over the fake store: equality/contains filters, search, sort, paging. */
export function fakeRecords(store: FakeStore): RecordStore {
  const label = (table: TableKey, row: RecordRow) => {
    if (table === "users") return String(row.values.name || row.values.email || row.values.phone || row.id);
    const def = tableDef(table);
    const value = def ? row.values[def.titleField] : null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? row.id);
  };
  const find = (table: TableKey, id: string) => rowsOf(store, table).find((r) => r.id === id) ?? null;
  return {
    async list(table, query) {
      const fields = tableDef(table)?.fields ?? [];
      let rows = rowsOf(store, table).filter((row) =>
        Object.entries(query.where).every(([key, want]) => {
          const value = key === "id" ? row.id : row.values[key];
          const type = fields.find((f) => f.key === key)?.type;
          return type === "roles" || type === "refs" ? Array.isArray(value) && (value as unknown[]).includes(want) : (value ?? null) === want;
        }),
      );
      if (query.search) {
        const term = query.search.term.toLowerCase();
        rows = rows.filter((row) => query.search?.fields.some((f) => String(row.values[f] ?? "").toLowerCase().includes(term)));
      }
      const { field, dir } = query.sort;
      const sign = dir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const x = comparable(a.values[field]) ?? "";
        const y = comparable(b.values[field]) ?? "";
        return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * sign;
      });
      return { rows: rows.slice(query.skip, query.skip + query.take), total: rows.length };
    },
    get: async (table, id) => find(table, id),
    labels: async (table, ids) => new Map(ids.flatMap((id) => {
      const row = find(table, id);
      return row ? [[id, label(table, row)] as const] : [];
    })),
    remove: async (table, id) => {
      if (table === "signInCodes") store.challenges.delete(id);
    },
  };
}
