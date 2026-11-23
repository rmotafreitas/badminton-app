import { type Actor, BadRequest, canSeeContactDetails, Forbidden, isObjectId, NotFound, ROLES, type Role } from "@bb/domain";
import type { AddClubMember, CreateClub, DeleteClub, RemoveClubMember, SetMemberRoles, UpdateClub, UpdateClubMember } from "@/clubs";
import type { DeleteGame, UpdateGame } from "@/games";
import type { CreateAccount, DeleteAccount, SessionRepository, UpdateAccount } from "@/identity";
import type { ModerateRallySession } from "@/rally";
import type { Clock, ImageUpload } from "@/shared";
import type { RemoveTrainingReview } from "@/training";
import type { GameSetValue, RecordCondition, RecordRow, RecordStore, RecordValue } from "./ports";
import {
  accessFor,
  editableFields,
  type FieldDef,
  type Label,
  type TableAccess,
  type TableDef,
  type TableKey,
  TABLES,
  tableDef,
  type ViewDef,
} from "./registry";
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
  readonly clock: Clock;
  readonly sessions: Pick<SessionRepository, "delete">;
  readonly removeTrainingReview: RemoveTrainingReview;
  readonly moderateRallySession: ModerateRallySession;
  readonly createClub: CreateClub;
  readonly updateClub: UpdateClub;
  readonly deleteClub: DeleteClub;
  readonly createAccount: CreateAccount;
  readonly updateAccount: UpdateAccount;
  readonly deleteAccount: DeleteAccount;
  readonly addClubMember: AddClubMember;
  readonly removeClubMember: RemoveClubMember;
  readonly setMemberRoles: SetMemberRoles;
  readonly updateClubMember: UpdateClubMember;
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
        } else {
          const { clubId: _club, ...changes } = accountInput(values);
          await deps.updateClubMember.execute({ actor, clubId: actor.clubId as string, userId: id, changes });
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
            ...(values.type !== undefined && { type: values.type as "SINGLES" | "DOUBLES" }),
            ...(values.team1PlayerIds !== undefined && { team1PlayerIds: values.team1PlayerIds as string[] }),
            ...(values.team2PlayerIds !== undefined && { team2PlayerIds: values.team2PlayerIds as string[] }),
          },
        });
      },
      delete: ({ actor }, id) => deps.deleteGame.execute({ actor, gameId: id }),
    },
    trainingReviews: { delete: ({ actor }, id) => deps.removeTrainingReview.execute({ actor, reviewId: id }) },
    rallySessions: {
      update: async ({ actor }, id, values) => {
        await deps.moderateRallySession.update({
          actor,
          id,
          input: {
            ...(values.title !== undefined && { title: str(values.title) }),
            ...(values.pinned !== undefined && { pinned: values.pinned as boolean }),
          },
        });
      },
      delete: ({ actor }, id) => deps.moderateRallySession.delete({ actor, id }),
    },
    // Housekeeping tables with no rules of their own: deleted directly (documented in docs/architecture.md).
    authSessions: { delete: (_ctx, id) => deps.sessions.delete(id) },
    authMethods: { delete: (_ctx, id) => deps.store.remove("authMethods", id) },
    signInCodes: { delete: (_ctx, id) => deps.store.remove("signInCodes", id) },
    rateLimits: { delete: (_ctx, id) => deps.store.remove("rateLimits", id) },
  };
}

// ── What a caller sees ───────────────────────────────────────────────────────

export interface TableView {
  readonly def: TableDef;
  readonly views: readonly { readonly key: string; readonly label: Label }[];
  /** Tables pointing at a row that this caller may open. */
  readonly related: readonly { readonly table: TableKey; readonly label: Label }[];
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

function view(actor: Actor, def: TableDef, access: TableAccess, handler: TableHandler | undefined): TableView {
  const create = handler?.create ? editableFields(def, access, "create") : [];
  const edit = handler?.update ? editableFields(def, access, "edit") : [];
  return {
    def,
    views: (def.views ?? []).map((v) => ({ key: v.key, label: v.label })),
    related: (def.related ?? []).flatMap((r) => {
      const child = tableDef(r.table);
      return child && accessFor(child, actor.roles, actor.clubId) ? [{ table: r.table, label: child.label }] : [];
    }),
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

export interface RecordPage {
  readonly table: TableView;
  readonly rows: readonly RecordRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Display names of referenced rows, per table and id. */
  readonly refs: Partial<Record<TableKey, Record<string, string>>>;
  /** When listing the rows related to one row: that row. */
  readonly of?: { readonly table: TableKey; readonly id: string; readonly label: string };
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
  /** One of the table's views. */
  readonly view?: string;
  /** Only the rows related to this row (one of its table's `related`). */
  readonly of?: { readonly table: string; readonly id: string };
}

export const MAX_PAGE_SIZE = 100;
/** Exports fetch big pages, several at a time; past this many rows they stop. */
export const EXPORT_PAGE_SIZE = 1000;
export const MAX_EXPORT_ROWS = 100_000;

const DAY_MS = 86_400_000;

function viewConditions(view: ViewDef, now: Date): RecordCondition[] {
  return view.where.flatMap((c): RecordCondition[] => {
    if ("is" in c) return [{ op: "any", fields: [c.field], value: c.is }];
    if ("empty" in c) return [{ op: "empty", field: c.field }];
    const at = (days: number) => new Date(now.getTime() + days * DAY_MS);
    return [
      ...(c.after !== undefined ? [{ op: "after" as const, field: c.field, value: at(c.after) }] : []),
      ...(c.before !== undefined ? [{ op: "before" as const, field: c.field, value: at(c.before) }] : []),
    ];
  });
}

/** A filter value of the right kind for its field: anything else is a 400, never a database query. */
function filterValue(field: FieldDef, value: unknown): string | boolean | null {
  const bad = () => new BadRequest(`Invalid filter for "${field.key}".`, "bad_filter");
  if (value === null) {
    if (field.type === "boolean" || field.type === "roles") throw bad();
    return null;
  }
  switch (field.type) {
    case "boolean":
      if (typeof value !== "boolean") throw bad();
      return value;
    case "ref":
    case "refs":
      if (typeof value !== "string" || !isObjectId(value)) throw bad();
      return value;
    case "enum":
      if (typeof value !== "string" || !field.options?.includes(value)) throw bad();
      return value;
    case "roles":
      if (typeof value !== "string" || !(ROLES as readonly string[]).includes(value)) throw bad();
      return value;
    case "text":
    case "email":
    case "phone":
      if (typeof value !== "string" || value.length > 100) throw bad();
      return value;
    default:
      // Dates, numbers, images…: not filterable by equality. Declaring one `filter` needs a case here first.
      throw bad();
  }
}

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
      return access ? [view(actor, def, access, this.handlers[def.key])] : [];
    });
  }

  async list(input: ListInput, limit = MAX_PAGE_SIZE): Promise<RecordPage> {
    const { def, access } = resolve(input.actor, input.table);
    const pageSize = Math.min(Math.max(Math.trunc(input.pageSize ?? 25), 1), limit);
    const page = Math.max(Math.trunc(input.page ?? 1), 1);
    const sortField = def.fields.find((f) => f.key === input.sort && f.sort) ? (input.sort as string) : def.defaultSort.field;
    const dir = input.sort === sortField && input.dir ? input.dir : input.sort === sortField ? "asc" : def.defaultSort.dir;
    const where: Record<string, string | boolean | null> = {};
    const conditions: RecordCondition[] = [];
    for (const [key, value] of Object.entries(input.filters ?? {})) {
      const field = def.fields.find((f) => f.key === key && f.filter);
      if (!field) throw new BadRequest(`You can't filter by "${key}".`, "bad_filter");
      const checked = filterValue(field, value);
      // "No value" also matches a field never set (MongoDB's null alone doesn't).
      if (checked === null) conditions.push({ op: "empty", field: key });
      else where[key] = checked;
    }
    Object.assign(where, scopeWhere(def, access, input.actor));
    if (input.view !== undefined) {
      const named = def.views?.find((v) => v.key === input.view);
      if (!named) throw new BadRequest(`No view "${input.view}".`, "bad_view");
      conditions.push(...viewConditions(named, this.deps.clock.now()));
    }
    let of: RecordPage["of"];
    if (input.of) {
      const parent = await this.relatedTo(input.actor, input.of.table, input.of.id, def.key);
      conditions.push(parent.condition);
      of = parent.of;
    }
    const term = input.q?.trim().slice(0, 100);
    const fields = def.fields.filter(searchable).map((f) => f.key);
    const { rows, total } = await this.deps.store.list(def.key, {
      where,
      conditions,
      search: term && fields.length ? { term, fields } : undefined,
      sort: { field: sortField, dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      table: view(input.actor, def, access, this.handlers[def.key]),
      rows,
      total,
      page,
      pageSize,
      refs: await this.refLabels(input.actor, def, rows),
      ...(of && { of }),
    };
  }

  /**
   * One page of an export: pages are bigger than the list's, so the browser builds the file from a few requests. The
   * same access, scope, view and filters apply.
   */
  exportPage(input: ListInput): Promise<RecordPage> {
    const pageSize = Math.min(Math.max(Math.trunc(input.pageSize ?? EXPORT_PAGE_SIZE), 1), EXPORT_PAGE_SIZE);
    const page = Math.max(Math.trunc(input.page ?? 1), 1);
    if ((page - 1) * pageSize >= MAX_EXPORT_ROWS) throw new BadRequest(`Exports stop at ${MAX_EXPORT_ROWS} rows.`, "export_too_big");
    return this.list({ ...input, page, pageSize }, EXPORT_PAGE_SIZE);
  }

  async get({ actor, table, id }: { actor: Actor; table: string; id: string }) {
    const { def, access, row } = await this.visibleRow(actor, table, id);
    return { table: view(actor, def, access, this.handlers[def.key]), row, refs: await this.refLabels(actor, def, [row]) };
  }

  /** The row, if the caller may see it (else NotFound): its table, the caller's access and the row. */
  private async visibleRow(actor: Actor, table: string, id: string) {
    const { def, access } = resolve(actor, table);
    if (!isObjectId(id)) throw new NotFound();
    const row = await this.deps.store.get(def.key, id);
    const scope = scopeWhere(def, access, actor);
    if (!row || Object.entries(scope).some(([k, v]) => (k === "id" ? row.id : row.values[k]) !== v)) throw new NotFound();
    return { def, access, row };
  }

  /** How many rows of each related table point at this row (only tables the caller may open, in their scope). */
  async related({ actor, table, id }: { actor: Actor; table: string; id: string }) {
    const { def, access } = await this.visibleRow(actor, table, id);
    const parent = view(actor, def, access, this.handlers[def.key]);
    return Promise.all(
      parent.related.map(async ({ table: key, label }) => {
        const child = resolve(actor, key);
        const entry = def.related?.find((r) => r.table === key) as NonNullable<TableDef["related"]>[number];
        const { total } = await this.deps.store.list(key, {
          where: scopeWhere(child.def, child.access, actor),
          conditions: [{ op: "any", fields: entry.fields, value: id }],
          sort: { field: child.def.defaultSort.field, dir: child.def.defaultSort.dir },
          skip: 0,
          take: 0,
        });
        return { table: key, label, count: total };
      }),
    );
  }

  /** The condition for "rows of `child` related to that row", after checking the caller may see that row. */
  private async relatedTo(actor: Actor, table: string, id: string, child: TableKey) {
    const entry = tableDef(table)?.related?.find((r) => r.table === child);
    if (!entry) throw new BadRequest(`"${table}" rows have no "${child}".`, "bad_related");
    const { def } = await this.visibleRow(actor, table, id);
    const label = (await this.labels(actor, def.key, [id])).get(id) ?? id;
    return {
      condition: { op: "any", fields: entry.fields, value: id } satisfies RecordCondition,
      of: { table: def.key, id, label },
    };
  }

  /**
   * Display names of rows. A nameless account reads as its email or phone only to someone allowed to see those;
   * anyone else sees a short id.
   */
  private async labels(actor: Actor, table: TableKey, ids: readonly string[]): Promise<Map<string, string>> {
    const labels = await this.deps.store.labels(table, ids);
    if (table !== "users") return labels;
    const nameless = [...labels].filter(([, label]) => !label).map(([id]) => id);
    if (!nameless.length) return labels;
    // One query for all of them.
    const users = new Map((await this.deps.store.getMany("users", nameless)).map((u) => [u.id, u.values]));
    for (const id of nameless) {
      const user = users.get(id);
      const visible = user && canSeeContactDetails(actor, { userId: id, clubId: (user.clubId as string | null) ?? null });
      labels.set(id, (visible && ((user.email as string | null) || (user.phone as string | null))) || `#${id.slice(-6)}`);
    }
    return labels;
  }

  private async refLabels(actor: Actor, def: TableDef, rows: readonly RecordRow[]) {
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
        if (ids.size) out[table] = Object.fromEntries(await this.labels(actor, table, [...ids]));
      }),
    );
    return out;
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
    const labels = await this.labels(actor, def.key, page.rows.map((r) => r.id));
    return page.rows.map((r) => ({ id: r.id, label: labels.get(r.id) ?? r.id }));
  }
}

function checkUploads(fields: readonly FieldDef[], uploads: Uploads) {
  for (const key of Object.keys(uploads)) {
    if (!fields.some((f) => f.key === key && f.type === "image")) throw new BadRequest(`You can't upload "${key}" here.`, "field_not_editable");
  }
}
