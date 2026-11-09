import { AUTH_PROVIDERS, RALLY_FORMATS, type Role } from "@bb/domain";

/**
 * The Data screens' table definitions: one entry per collection, in the spirit of a column config file. Each field
 * says how it is shown and which of list / search / sort / filter / create / edit it takes part in; `access` says which
 * roles see the table, whether they see every row or only their club's, and what they may change.
 *
 * Secrets (password hashes, token hashes) are simply not listed, so they never leave the server. Writes never go
 * straight to the database: each table's handler (`handlers.ts`) calls the use case that owns the rules.
 */

export type FieldType =
  | "text"
  | "longtext"
  | "email"
  | "phone"
  | "integer"
  | "number"
  | "boolean"
  /** A calendar day, `YYYY-MM-DD`. */
  | "day"
  | "datetime"
  | "enum"
  | "roles"
  /** Another table's id (`ref`). */
  | "ref"
  /** Several ids of `ref`. */
  | "refs"
  | "image"
  /** A game's sets: `{ team1Score, team2Score }[]`. */
  | "sets"
  | "bytes"
  | "seconds";

export interface Label {
  readonly en: string;
  readonly pt: string;
}

export interface FieldDef {
  readonly key: string;
  readonly label: Label;
  readonly type: FieldType;
  /** For `ref` / `refs`. */
  readonly ref?: TableKey;
  /** For `enum`. */
  readonly options?: readonly string[];
  /** For `image`: where `/api/media` finds it. */
  readonly image?: { readonly owner: "club" | "profile"; readonly kind: string };
  /** A column of the table. */
  readonly list?: boolean;
  /** Matched by the search box (text-like fields only). */
  readonly search?: boolean;
  readonly sort?: boolean;
  /** Offered as a filter (enum, boolean, ref, roles). */
  readonly filter?: boolean;
  readonly create?: boolean;
  readonly edit?: boolean;
  readonly required?: boolean;
  readonly max?: number;
  readonly min?: number;
}

export interface TableAccess {
  /** `club`: only rows of the actor's own club (`TableDef.clubField`). */
  readonly scope: "all" | "club";
  readonly create?: boolean;
  readonly update?: boolean;
  readonly delete?: boolean;
  /** Fields this role may set on create / edit. Default: every field marked `create` / `edit`. */
  readonly createFields?: readonly string[];
  readonly editFields?: readonly string[];
  /** What "delete" means for this role, when it isn't a delete (e.g. "Remove from club"). */
  readonly deleteLabel?: Label;
}

export interface TableDef {
  readonly key: TableKey;
  readonly label: Label;
  /** A lucide icon name the web app maps. */
  readonly icon: string;
  /** The field that names a row (search target for reference pickers, title of the detail sheet). */
  readonly titleField: string;
  readonly defaultSort: { readonly field: string; readonly dir: "asc" | "desc" };
  /** The field holding the row's club, for club-scoped access (`id` for the clubs table itself). */
  readonly clubField?: string;
  readonly fields: readonly FieldDef[];
  /** Roles not listed don't see the table at all. */
  readonly access: Partial<Record<Role, TableAccess>>;
  /** Shown before a delete. */
  readonly deleteHint?: Label;
}

export const TABLE_KEYS = [
  "clubs",
  "users",
  "games",
  "trainingReviews",
  "rallySessions",
  "authMethods",
  "authSessions",
  "signInCodes",
  "rateLimits",
] as const;
export type TableKey = (typeof TABLE_KEYS)[number];

const L = (en: string, pt: string): Label => ({ en, pt });
const createdAt: FieldDef = { key: "createdAt", label: L("Created", "Criado"), type: "datetime", sort: true };
const systemOnly = { SYSTEM_ADMIN: { scope: "all", delete: true } } as const satisfies TableDef["access"];

export const TABLES: readonly TableDef[] = [
  {
    key: "clubs",
    label: L("Clubs", "Clubes"),
    icon: "building",
    titleField: "name",
    defaultSort: { field: "name", dir: "asc" },
    clubField: "id",
    fields: [
      { key: "picture", label: L("Logo", "Logótipo"), type: "image", image: { owner: "club", kind: "picture" }, list: true, create: true, edit: true },
      { key: "name", label: L("Name", "Nome"), type: "text", list: true, search: true, sort: true, create: true, edit: true, required: true, min: 2, max: 80 },
      { key: "location", label: L("Location", "Localização"), type: "text", list: true, search: true, sort: true, create: true, edit: true, max: 120 },
      { key: "banner", label: L("Banner", "Capa"), type: "image", image: { owner: "club", kind: "banner" }, create: true, edit: true },
      { ...createdAt, list: true },
      { key: "updatedAt", label: L("Updated", "Atualizado"), type: "datetime", sort: true },
    ],
    access: {
      SYSTEM_ADMIN: { scope: "all", create: true, update: true, delete: true },
      CLUB_ADMIN: { scope: "club", update: true },
      COACH: { scope: "club" },
    },
    deleteHint: L(
      "Members are moved out of the club. Clubs with recorded games can't be deleted.",
      "Os membros saem do clube. Clubes com jogos registados não podem ser eliminados.",
    ),
  },
  {
    key: "users",
    label: L("Members", "Membros"),
    icon: "users",
    titleField: "name",
    defaultSort: { field: "createdAt", dir: "desc" },
    clubField: "clubId",
    fields: [
      { key: "photo", label: L("Photo", "Foto"), type: "image", image: { owner: "profile", kind: "photo" }, list: true },
      { key: "name", label: L("Name", "Nome"), type: "text", list: true, search: true, sort: true, create: true, edit: true, max: 80 },
      { key: "email", label: L("Email", "Email"), type: "email", list: true, search: true, sort: true, create: true, edit: true },
      { key: "phone", label: L("Phone", "Telemóvel"), type: "phone", list: true, search: true, create: true, edit: true },
      { key: "roles", label: L("Roles", "Funções"), type: "roles", list: true, filter: true, create: true, edit: true },
      { key: "clubId", label: L("Club", "Clube"), type: "ref", ref: "clubs", list: true, filter: true, create: true, edit: true },
      { key: "eloSingles", label: L("Singles rating", "Rating singulares"), type: "number", list: true, sort: true },
      { key: "eloDoubles", label: L("Doubles rating", "Rating pares"), type: "number", list: true, sort: true },
      { key: "isActive", label: L("Active", "Ativo"), type: "boolean", list: true, filter: true, edit: true },
      { key: "lastAccess", label: L("Last seen", "Último acesso"), type: "datetime", sort: true },
      { ...createdAt, label: L("Joined", "Desde"), list: true },
    ],
    access: {
      SYSTEM_ADMIN: { scope: "all", create: true, update: true, delete: true },
      CLUB_ADMIN: {
        scope: "club",
        create: true,
        update: true,
        delete: true,
        createFields: ["name", "email", "phone", "roles"],
        editFields: ["roles"],
        deleteLabel: L("Remove from club", "Remover do clube"),
      },
      COACH: { scope: "club" },
    },
    deleteHint: L(
      "Accounts with games or recordings can't be deleted: deactivate them instead. In a club, this removes the person from the club; their games stay.",
      "Contas com jogos ou gravações não podem ser eliminadas: desativa-as. Num clube, isto remove a pessoa do clube; os jogos ficam.",
    ),
  },
  {
    key: "games",
    label: L("Games", "Jogos"),
    icon: "trophy",
    titleField: "playedAt",
    defaultSort: { field: "playedAt", dir: "desc" },
    clubField: "clubId",
    fields: [
      { key: "playedAt", label: L("Played", "Jogado"), type: "datetime", list: true, sort: true, edit: true, required: true },
      { key: "type", label: L("Type", "Tipo"), type: "enum", options: ["SINGLES", "DOUBLES"], list: true, filter: true },
      { key: "clubId", label: L("Club", "Clube"), type: "ref", ref: "clubs", list: true, filter: true },
      { key: "team1PlayerIds", label: L("Team 1", "Equipa 1"), type: "refs", ref: "users", list: true },
      { key: "team2PlayerIds", label: L("Team 2", "Equipa 2"), type: "refs", ref: "users", list: true },
      { key: "sets", label: L("Score", "Resultado"), type: "sets", list: true, edit: true, required: true },
      { key: "registeredById", label: L("Registered by", "Registado por"), type: "ref", ref: "users" },
      createdAt,
    ],
    access: {
      SYSTEM_ADMIN: { scope: "all", update: true, delete: true },
      CLUB_ADMIN: { scope: "club", update: true, delete: true },
      COACH: { scope: "club", update: true, delete: true },
    },
    deleteHint: L("Ratings of the club are recalculated.", "Os ratings do clube são recalculados."),
  },
  {
    key: "trainingReviews",
    label: L("Training reviews", "Avaliações de treino"),
    icon: "calendar",
    titleField: "date",
    defaultSort: { field: "date", dir: "desc" },
    fields: [
      { key: "userId", label: L("Player", "Jogador"), type: "ref", ref: "users", list: true, filter: true },
      { key: "date", label: L("Day", "Dia"), type: "day", list: true, sort: true },
      { key: "effort", label: L("Effort", "Esforço"), type: "integer", list: true, sort: true },
      { key: "note", label: L("Note", "Nota"), type: "longtext", list: true, search: true },
      createdAt,
    ],
    access: systemOnly,
  },
  {
    key: "rallySessions",
    label: L("Rally recordings", "Gravações de rallies"),
    icon: "video",
    titleField: "title",
    defaultSort: { field: "recordedAt", dir: "desc" },
    fields: [
      { key: "title", label: L("Title", "Título"), type: "text", list: true, search: true, sort: true, edit: true, max: 120 },
      { key: "ownerId", label: L("Owner", "Dono"), type: "ref", ref: "users", list: true, filter: true },
      { key: "recordedAt", label: L("Recorded", "Gravado"), type: "datetime", list: true, sort: true },
      { key: "durationS", label: L("Length", "Duração"), type: "seconds", list: true, sort: true },
      { key: "status", label: L("Status", "Estado"), type: "enum", options: ["pending", "analysing", "analysed", "failed"], list: true, filter: true },
      { key: "format", label: L("Format", "Formato"), type: "enum", options: RALLY_FORMATS, list: true, filter: true },
      { key: "gameId", label: L("Game", "Jogo"), type: "ref", ref: "games" },
      { key: "pinned", label: L("Kept", "Guardado"), type: "boolean", list: true, filter: true, edit: true },
      { key: "videoBytes", label: L("Video size", "Tamanho do vídeo"), type: "bytes", list: true, sort: true },
      { key: "videoExpiresAt", label: L("Video expires", "Vídeo expira"), type: "datetime", sort: true },
      { key: "shareForTraining", label: L("Shared for training", "Partilhado para treino"), type: "boolean", filter: true },
      createdAt,
    ],
    access: { SYSTEM_ADMIN: { scope: "all", update: true, delete: true } },
    deleteHint: L("The video and analysis files are deleted too.", "O vídeo e a análise também são apagados."),
  },
  {
    key: "authMethods",
    label: L("Sign-in methods", "Métodos de entrada"),
    icon: "key",
    titleField: "providerId",
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { key: "userId", label: L("User", "Utilizador"), type: "ref", ref: "users", list: true, filter: true },
      { key: "provider", label: L("Provider", "Fornecedor"), type: "enum", options: AUTH_PROVIDERS, list: true, filter: true },
      { key: "providerId", label: L("Identifier", "Identificador"), type: "text", list: true, search: true },
      { ...createdAt, list: true },
    ],
    access: systemOnly,
    deleteHint: L(
      "They can still sign in with a code sent to their email or phone.",
      "Ainda podem entrar com um código enviado para o email ou telemóvel.",
    ),
  },
  {
    key: "authSessions",
    label: L("Sessions", "Sessões"),
    icon: "monitor",
    titleField: "userAgent",
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { key: "userId", label: L("User", "Utilizador"), type: "ref", ref: "users", list: true, filter: true },
      { key: "userAgent", label: L("Device", "Dispositivo"), type: "text", list: true, search: true },
      { key: "expiresAt", label: L("Expires", "Expira"), type: "datetime", list: true, sort: true },
      { ...createdAt, label: L("Signed in", "Entrou"), list: true },
    ],
    access: systemOnly,
    deleteHint: L("That device is signed out.", "Esse dispositivo fica sem sessão."),
  },
  {
    key: "signInCodes",
    label: L("Sign-in codes", "Códigos de entrada"),
    icon: "mail",
    titleField: "target",
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { key: "target", label: L("Sent to", "Enviado para"), type: "text", list: true, search: true },
      { key: "type", label: L("Kind", "Tipo"), type: "enum", options: ["email-link", "email-code", "sms-code"], list: true, filter: true },
      { key: "used", label: L("Used", "Usado"), type: "boolean", list: true, filter: true },
      { key: "expiresAt", label: L("Expires", "Expira"), type: "datetime", list: true, sort: true },
      { ...createdAt, list: true },
    ],
    access: systemOnly,
  },
  {
    key: "rateLimits",
    label: L("Rate limits", "Limites de tentativas"),
    icon: "gauge",
    titleField: "key",
    defaultSort: { field: "windowStart", dir: "desc" },
    fields: [
      { key: "key", label: L("Key", "Chave"), type: "text", list: true, search: true, sort: true },
      { key: "count", label: L("Attempts", "Tentativas"), type: "integer", list: true, sort: true },
      { key: "windowStart", label: L("Window start", "Início"), type: "datetime", list: true, sort: true },
      { key: "expiresAt", label: L("Expires", "Expira"), type: "datetime", list: true, sort: true },
    ],
    access: systemOnly,
    deleteHint: L("Deleting a window lets that address try again at once.", "Apagar deixa esse endereço tentar de novo já."),
  },
];

export const tableDef = (key: string): TableDef | undefined => TABLES.find((t) => t.key === key);

/** Broadest access first: a system admin who is also a club admin gets the system admin's view. */
const ROLE_PRIORITY: readonly Role[] = ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"];

export function accessFor(def: TableDef, roles: readonly Role[], clubId: string | null): TableAccess | null {
  for (const role of ROLE_PRIORITY) {
    const access = def.access[role];
    if (!access || !roles.includes(role)) continue;
    // Club-scoped access without a club is no access.
    if (access.scope === "club" && (!clubId || !def.clubField)) continue;
    return access;
  }
  return null;
}

export const editableFields = (def: TableDef, access: TableAccess, mode: "create" | "edit"): FieldDef[] => {
  if (!(mode === "create" ? access.create : access.update)) return [];
  const allowed = mode === "create" ? access.createFields : access.editFields;
  return def.fields.filter((f) => (mode === "create" ? f.create : f.edit) && (!allowed || allowed.includes(f.key)));
};
