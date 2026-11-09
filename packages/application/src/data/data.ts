import { type Actor, BadRequest, Forbidden, isObjectId, NotFound, type Role } from "@bb/domain";
import type { AddClubMember, CreateClub, DeleteClub, RemoveClubMember, SetMemberRoles, UpdateClub } from "@/clubs";
import type { DeleteGame, UpdateGame } from "@/games";
import type { CreateAccount, DeleteAccount, SessionRepository, UpdateAccount } from "@/identity";
import type { RallySessionRepository } from "@/rally";
import type { ImageUpload, ObjectStorage } from "@/shared";
import type { TrainingReviewRepository } from "@/training";
import type { GameSetValue, RecordRow, RecordStore, RecordValue } from "./ports";
import { accessFor, editableFields, type FieldDef, type TableAccess, type TableDef, type TableKey, TABLES, tableDef } from "./registry";
import { parseValues } from "./values";

type Values = Record<string, RecordValue>;
type Uploads = Readonly<Record<string, ImageUpload>>;

interface WriteContext {
  readonly actor: Actor;
  readonly access: TableAccess;
}

/** How a table's rows are created, changed and deleted: always through the use case that owns the rules. */
interface TableHandler {
  create?(ctx: WriteContext, values: Values, uploads: Uploads): Promise<string>;
  update?(ctx: WriteContext, id: string, values: Values, uploads: Uploads): Promise<void>;
  delete?(ctx: WriteContext, id: string): Promise<void>;
}

export interface DataDeps {
  readonly store: RecordStore;
  readonly storage: ObjectStorage;
  readonly sessions: Pick<SessionRepository, "delete">;
  readonly reviews: Pick<TrainingReviewRepository, "delete">;
  readonly rally: Pick<RallySessionRepository, "findById" | "update" | "delete">;
  readonly createClub: CreateClub;
  readonly updateClub: UpdateClub;
  readonly deleteClub: DeleteClub;
  readonly createAccount: CreateAccount;
  readonly updateAccount: UpdateAccount;
  readonly deleteAccount: DeleteAccount;
  readonly addClubMember: AddClubMember;
  readonly removeClubMember: RemoveClubMember;
  readonly setMemberRoles: SetMemberRoles;
  readonly updateGame: UpdateGame;
  readonly deleteGame: DeleteGame;
}

const str = (v: RecordValue | undefined) => (v === undefined ? undefined : ((v as string | null) ?? null));

function handlers(deps: DataDeps): Partial<Record<TableKey, TableHandler>> {
  const clubInput = (values: Values, uploads: Uploads) => ({
    ...(values.name !== undefined && { name: values.name as string }),
    ...(values.location !== undefined && { location: str(values.location) }),
    picture: uploads.picture,
    banner: uploads.banner,
  });
  const accountInput = (values: Values) => ({
    name: values.name === undefined ? undefined : ((values.name as string | null) ?? ""),
    email: str(values.email),
    phone: str(values.phone),
    roles: values.roles as Role[] | undefined,
    clubId: str(values.clubId),
    isActive: values.isActive as boolean | undefined,
  });
  return {
    clubs: {
      create: async ({ actor }, values, uploads) =>
        (await deps.createClub.execute({ actor, input: { ...clubInput(values, uploads), name: values.name as string } })).id,
      update: async ({ actor }, id, values, uploads) => {
        await deps.updateClub.execute({ actor, clubId: id, input: clubInput(values, uploads) });
      },
      delete: ({ actor }, id) => deps.deleteClub.execute({ actor, clubId: id }),
    },
    users: {
      // System admins manage accounts; club admins manage their club's membership.
      create: async ({ actor, access }, values) => {
        if (access.scope === "all") return (await deps.createAccount.execute({ actor, input: accountInput(values) })).id;
        const input = accountInput(values);
        const user = await deps.addClubMember.execute({
          actor,
          clubId: actor.clubId as string,
          input: { email: input.email ?? undefined, phone: input.phone ?? undefined, name: input.name, roles: input.roles },
        });
        return user.id;
      },
      update: async ({ actor, access }, id, values) => {
        if (access.scope === "all") {
          await deps.updateAccount.execute({ actor, userId: id, input: accountInput(values) });
        } else if (values.roles) {
          await deps.setMemberRoles.execute({ actor, clubId: actor.clubId as string, userId: id, roles: values.roles as Role[] });
        }
      },
      delete: ({ actor, access }, id) =>
        access.scope === "all"
          ? deps.deleteAccount.execute({ actor, userId: id })
          : deps.removeClubMember.execute({ actor, clubId: actor.clubId as string, userId: id }),
    },
    games: {
      update: async ({ actor }, id, values) => {
        await deps.updateGame.execute({
          actor,
          gameId: id,
          changes: {
            ...(values.sets !== undefined && { sets: values.sets as GameSetValue[] }),
            ...(values.playedAt instanceof Date && { playedAt: values.playedAt }),
          },
        });
      },
      delete: ({ actor }, id) => deps.deleteGame.execute({ actor, gameId: id }),
    },
    trainingReviews: { delete: (_ctx, id) => deps.reviews.delete(id) },
    rallySessions: {
      update: async (_ctx, id, values) => {
        await deps.rally.update(id, {
          ...(values.title !== undefined && { title: str(values.title) }),
          ...(values.pinned !== undefined && { pinned: values.pinned as boolean }),
        });
      },
      delete: async (_ctx, id) => {
        const session = await deps.rally.findById(id);
        if (!session) return;
        await Promise.all([session.videoKey, session.resultKey].filter((k): k is string => !!k).map((k) => deps.storage.delete(k)));
        await deps.rally.delete(id);
      },
    },
    authSessions: { delete: (_ctx, id) => deps.sessions.delete(id) },
    authMethods: { delete: (_ctx, id) => deps.store.remove("authMethods", id) },
    signInCodes: { delete: (_ctx, id) => deps.store.remove("signInCodes", id) },
    rateLimits: { delete: (_ctx, id) => deps.store.remove("rateLimits", id) },
  };
}

// ── What a caller sees ───────────────────────────────────────────────────────

export interface TableView {
  readonly def: TableDef;
  readonly scope: "all" | "club";
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canDelete: boolean;
  readonly createFields: readonly string[];
  readonly editFields: readonly string[];
  readonly deleteLabel: TableAccess["deleteLabel"];
}

/** The table and the caller's access to it. Tables the caller can't see don't exist (NotFound). */
function resolve(actor: Actor, key: string) {
  const def = tableDef(key);
  const access = def ? accessFor(def, actor.roles, actor.clubId) : null;
  if (!def || !access) throw new NotFound("Table not found.");
  return { def, access };
}

function view(def: TableDef, access: TableAccess, handler: TableHandler | undefined): TableView {
  const create = handler?.create ? editableFields(def, access, "create") : [];
  const edit = handler?.update ? editableFields(def, access, "edit") : [];
  return {
    def,
    scope: access.scope,
    canCreate: create.length > 0,
    canUpdate: edit.length > 0,
    canDelete: !!access.delete && !!handler?.delete,
    createFields: create.map((f) => f.key),
    editFields: edit.map((f) => f.key),
    deleteLabel: access.deleteLabel,
  };
}

/** Club-scoped callers only ever see and touch their club's rows. */
const scopeWhere = (def: TableDef, access: TableAccess, actor: Actor): Record<string, string> =>
  access.scope === "club" && def.clubField ? { [def.clubField]: actor.clubId as string } : {};

async function refLabels(store: RecordStore, def: TableDef, rows: readonly RecordRow[]) {
  const wanted = new Map<TableKey, Set<string>>();
  for (const field of def.fields) {
    if (!field.ref || (field.type !== "ref" && field.type !== "refs")) continue;
    const ids = wanted.get(field.ref) ?? new Set<string>();
    for (const row of rows) {
      const value = row.values[field.key];
      for (const id of Array.isArray(value) ? value : [value]) if (typeof id === "string") ids.add(id);
    }
    wanted.set(field.ref, ids);
  }
  const out: Partial<Record<TableKey, Record<string, string>>> = {};
  await Promise.all(
    [...wanted].map(async ([table, ids]) => {
      if (ids.size) out[table] = Object.fromEntries(await store.labels(table, [...ids]));
    }),
  );
  return out;
}

export interface RecordPage {
  readonly table: TableView;
  readonly rows: readonly RecordRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Display names of referenced rows, per table and id. */
  readonly refs: Partial<Record<TableKey, Record<string, string>>>;
}

export interface ListInput {
  readonly actor: Actor;
  readonly table: string;
  readonly q?: string;
  readonly sort?: string;
  readonly dir?: "asc" | "desc";
  readonly page?: number;
  readonly pageSize?: number;
  readonly filters?: Readonly<Record<string, string | boolean | null>>;
}

export const MAX_PAGE_SIZE = 100;
export const MAX_EXPORT_ROWS = 5000;

const searchable = (f: FieldDef) => f.search && ["text", "longtext", "email", "phone"].includes(f.type);

export class DataTables {
  private readonly handlers: Partial<Record<TableKey, TableHandler>>;
  constructor(private readonly deps: DataDeps) {
    this.handlers = handlers(deps);
  }

  /** Every table the caller may open, with what they may do in it. Empty for players. */
  describe({ actor }: { actor: Actor }): TableView[] {
    return TABLES.flatMap((def) => {
      const access = accessFor(def, actor.roles, actor.clubId);
      return access ? [view(def, access, this.handlers[def.key])] : [];
    });
  }

  async list(input: ListInput, limit = MAX_PAGE_SIZE): Promise<RecordPage> {
    const { def, access } = resolve(input.actor, input.table);
    const pageSize = Math.min(Math.max(Math.trunc(input.pageSize ?? 25), 1), limit);
    const page = Math.max(Math.trunc(input.page ?? 1), 1);
    const sortField = def.fields.find((f) => f.key === input.sort && f.sort) ? (input.sort as string) : def.defaultSort.field;
    const dir = input.sort === sortField && input.dir ? input.dir : input.sort === sortField ? "asc" : def.defaultSort.dir;
    const where: Record<string, string | boolean | null> = {};
    for (const [key, value] of Object.entries(input.filters ?? {})) {
      const field = def.fields.find((f) => f.key === key && f.filter);
      if (!field) throw new BadRequest(`You can't filter by "${key}".`, "bad_filter");
      if ((field.type === "ref" && value !== null && (typeof value !== "string" || !isObjectId(value))) || (field.type === "boolean" && typeof value !== "boolean")) {
        throw new BadRequest(`Invalid filter for "${key}".`, "bad_filter");
      }
      where[key] = value;
    }
    Object.assign(where, scopeWhere(def, access, input.actor));
    const term = input.q?.trim().slice(0, 100);
    const fields = def.fields.filter(searchable).map((f) => f.key);
    const { rows, total } = await this.deps.store.list(def.key, {
      where,
      search: term && fields.length ? { term, fields } : undefined,
      sort: { field: sortField, dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { table: view(def, access, this.handlers[def.key]), rows, total, page, pageSize, refs: await refLabels(this.deps.store, def, rows) };
  }

  /** Every matching row (up to MAX_EXPORT_ROWS), for a CSV download. */
  export(input: Omit<ListInput, "page" | "pageSize">): Promise<RecordPage> {
    return this.list({ ...input, page: 1, pageSize: MAX_EXPORT_ROWS }, MAX_EXPORT_ROWS);
  }

  async get({ actor, table, id }: { actor: Actor; table: string; id: string }) {
    const { def, access } = resolve(actor, table);
    if (!isObjectId(id)) throw new NotFound();
    const row = await this.deps.store.get(def.key, id);
    const scope = scopeWhere(def, access, actor);
    if (!row || Object.entries(scope).some(([k, v]) => (k === "id" ? row.id : row.values[k]) !== v)) throw new NotFound();
    return { table: view(def, access, this.handlers[def.key]), row, refs: await refLabels(this.deps.store, def, [row]) };
  }

  async create({ actor, table, values, uploads = {} }: { actor: Actor; table: string; values: Record<string, unknown>; uploads?: Uploads }) {
    const { def, access } = resolve(actor, table);
    const handler = this.handlers[def.key];
    const fields = editableFields(def, access, "create");
    if (!handler?.create || fields.length === 0) throw new Forbidden();
    checkUploads(fields, uploads);
    const id = await handler.create({ actor, access }, parseValues(fields, values, "create"), uploads);
    return this.get({ actor, table, id });
  }

  async update({ actor, table, id, values, uploads = {} }: { actor: Actor; table: string; id: string; values: Record<string, unknown>; uploads?: Uploads }) {
    const { def, access } = resolve(actor, table);
    await this.get({ actor, table, id }); // existence + scope
    const handler = this.handlers[def.key];
    const fields = editableFields(def, access, "edit");
    if (!handler?.update || fields.length === 0) throw new Forbidden();
    checkUploads(fields, uploads);
    await handler.update({ actor, access }, id, parseValues(fields, values, "edit"), uploads);
    return this.get({ actor, table, id });
  }

  async delete({ actor, table, id }: { actor: Actor; table: string; id: string }): Promise<void> {
    const { def, access } = resolve(actor, table);
    await this.get({ actor, table, id });
    const handler = this.handlers[def.key];
    if (!access.delete || !handler?.delete) throw new Forbidden();
    await handler.delete({ actor, access }, id);
  }

  /** Rows of `table` matching `q`, as `{ id, label }`, for reference pickers and filters. */
  async options({ actor, table, q }: { actor: Actor; table: string; q?: string }) {
    const { def } = resolve(actor, table);
    const page = await this.list({ actor, table, q, sort: def.titleField, dir: "asc", pageSize: 20 });
    const labels = await this.deps.store.labels(def.key, page.rows.map((r) => r.id));
    return page.rows.map((r) => ({ id: r.id, label: labels.get(r.id) ?? r.id }));
  }
}

function checkUploads(fields: readonly FieldDef[], uploads: Uploads) {
  for (const key of Object.keys(uploads)) {
    if (!fields.some((f) => f.key === key && f.type === "image")) throw new BadRequest(`You can't upload "${key}" here.`, "field_not_editable");
  }
}
