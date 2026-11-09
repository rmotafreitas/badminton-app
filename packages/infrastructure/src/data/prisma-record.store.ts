import { type RecordQuery, type RecordRow, type RecordStore, type RecordValue, type TableKey, tableDef } from "@bb/application";
import { isObjectId } from "@bb/domain";
import type { Database } from "@/shared/database";

type Row = Record<string, unknown>;

/** The handful of Prisma delegate methods the Data screens use (every model has them). */
interface Delegate {
  findMany(args: object): Promise<Row[]>;
  findUnique(args: object): Promise<Row | null>;
  count(args: object): Promise<number>;
  delete(args: object): Promise<unknown>;
}

interface TableMapping {
  readonly model: (db: Database) => Delegate;
  readonly select: Readonly<Record<string, unknown>>;
  /** Registry fields that live in a related document: field → [relation, column]. */
  readonly related?: Readonly<Record<string, readonly [string, string]>>;
  /** Stored column per registry field, when they differ (club `picture` → `pictureVersion`). */
  readonly columns?: Readonly<Record<string, string>>;
  readonly label: (row: Row) => string;
}

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : "");

const MAPPINGS: Record<TableKey, TableMapping> = {
  clubs: {
    model: (db) => db.club as unknown as Delegate,
    select: { id: true, name: true, location: true, pictureVersion: true, bannerVersion: true, createdAt: true, updatedAt: true },
    columns: { picture: "pictureVersion", banner: "bannerVersion" },
    label: (r) => String(r.name ?? ""),
  },
  users: {
    model: (db) => db.user as unknown as Delegate,
    // Never `passwordHash`: secrets aren't listed in the registry and aren't selected here either.
    select: {
      id: true,
      email: true,
      phone: true,
      roles: true,
      clubId: true,
      eloSingles: true,
      eloDoubles: true,
      isActive: true,
      lastAccess: true,
      createdAt: true,
      profile: { select: { name: true, photoVersion: true } },
    },
    related: { name: ["profile", "name"], photo: ["profile", "photoVersion"] },
    label: (r) => String((r.profile as Row | null)?.name || r.email || r.phone || r.id),
  },
  games: {
    model: (db) => db.game as unknown as Delegate,
    select: { id: true, playedAt: true, type: true, clubId: true, team1PlayerIds: true, team2PlayerIds: true, sets: true, registeredById: true, createdAt: true },
    label: (r) => `${day(r.playedAt)} · ${String(r.type ?? "").toLowerCase()}`,
  },
  trainingReviews: {
    model: (db) => db.trainingSessionReview as unknown as Delegate,
    select: { id: true, userId: true, date: true, effort: true, note: true, createdAt: true },
    label: (r) => String(r.date ?? ""),
  },
  rallySessions: {
    model: (db) => db.rallySession as unknown as Delegate,
    select: {
      id: true,
      title: true,
      ownerId: true,
      recordedAt: true,
      durationS: true,
      status: true,
      format: true,
      gameId: true,
      pinned: true,
      videoBytes: true,
      videoExpiresAt: true,
      shareForTraining: true,
      createdAt: true,
    },
    label: (r) => String(r.title || day(r.recordedAt)),
  },
  authMethods: {
    model: (db) => db.authMethod as unknown as Delegate,
    select: { id: true, userId: true, provider: true, providerId: true, createdAt: true },
    label: (r) => `${r.provider}: ${r.providerId}`,
  },
  authSessions: {
    model: (db) => db.authSession as unknown as Delegate,
    // Never `tokenHash`.
    select: { id: true, userId: true, userAgent: true, expiresAt: true, createdAt: true },
    label: (r) => String(r.userAgent ?? r.id),
  },
  signInCodes: {
    model: (db) => db.magicToken as unknown as Delegate,
    // Never `token` (the code's hash).
    select: { id: true, target: true, type: true, used: true, expiresAt: true, createdAt: true },
    label: (r) => String(r.target ?? ""),
  },
  rateLimits: {
    model: (db) => db.rateLimitBucket as unknown as Delegate,
    select: { id: true, key: true, count: true, windowStart: true, expiresAt: true },
    label: (r) => String(r.key ?? ""),
  },
};

/** Generic reads over every Data table (and deletes for the tables without a use case). MongoDB through Prisma. */
export class PrismaRecordStore implements RecordStore {
  constructor(private readonly db: Database) {}

  async list(table: TableKey, query: RecordQuery): Promise<{ rows: RecordRow[]; total: number }> {
    const m = MAPPINGS[table];
    const where = this.where(table, query);
    const { field, dir } = query.sort;
    const related = m.related?.[field];
    // `id` second, so equal sort values page in a stable order.
    const orderBy = [related ? { [related[0]]: { [related[1]]: dir } } : { [m.columns?.[field] ?? field]: dir }, { id: dir }];
    const [rows, total] = await Promise.all([
      m.model(this.db).findMany({ where, select: m.select, orderBy, skip: query.skip, take: query.take }),
      m.model(this.db).count({ where }),
    ]);
    return { rows: rows.map((r) => this.toRow(table, r)), total };
  }

  async get(table: TableKey, id: string): Promise<RecordRow | null> {
    if (!isObjectId(id)) return null;
    const m = MAPPINGS[table];
    const row = await m.model(this.db).findUnique({ where: { id }, select: m.select });
    return row ? this.toRow(table, row) : null;
  }

  async labels(table: TableKey, ids: readonly string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids)].filter(isObjectId);
    if (!valid.length) return new Map();
    const m = MAPPINGS[table];
    const rows = await m.model(this.db).findMany({ where: { id: { in: valid } }, select: m.select });
    return new Map(rows.map((r) => [String(r.id), m.label(r)]));
  }

  async remove(table: "authMethods" | "signInCodes" | "rateLimits", id: string): Promise<void> {
    if (!isObjectId(id)) return;
    // deleteMany: deleting something already gone is not an error.
    await (MAPPINGS[table].model(this.db) as unknown as { deleteMany(args: object): Promise<unknown> }).deleteMany({ where: { id } });
  }

  private where(table: TableKey, query: RecordQuery) {
    const m = MAPPINGS[table];
    const fields = tableDef(table)?.fields ?? [];
    const and: Row[] = [];
    for (const [key, value] of Object.entries(query.where)) {
      if (key === "id") {
        and.push({ id: value });
        continue;
      }
      const type = fields.find((f) => f.key === key)?.type;
      const column = m.columns?.[key] ?? key;
      and.push(type === "roles" || type === "refs" ? { [column]: { has: value } } : { [column]: value });
    }
    if (query.search) {
      // Prisma's MongoDB connector turns `contains` into a $regex WITHOUT escaping it: escape, or "+351" breaks the
      // search and ".*" or a catastrophic pattern would be run as typed.
      const contains = { contains: escapeRegex(query.search.term), mode: "insensitive" };
      and.push({
        OR: query.search.fields.map((key) => {
          const related = m.related?.[key];
          return related ? { [related[0]]: { is: { [related[1]]: contains } } } : { [m.columns?.[key] ?? key]: contains };
        }),
      });
    }
    return and.length ? { AND: and } : {};
  }

  private toRow(table: TableKey, row: Row): RecordRow {
    const m = MAPPINGS[table];
    const values: Record<string, RecordValue> = {};
    for (const field of tableDef(table)?.fields ?? []) {
      const related = m.related?.[field.key];
      const raw = related ? (row[related[0]] as Row | null)?.[related[1]] : row[m.columns?.[field.key] ?? field.key];
      values[field.key] = (raw ?? null) as RecordValue;
    }
    return { id: String(row.id), values };
  }
}
