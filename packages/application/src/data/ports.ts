import type { TableKey } from "./registry";

export interface GameSetValue {
  readonly team1Score: number;
  readonly team2Score: number;
}

/** A field's stored value. Images are their content version (null = none). */
export type RecordValue = string | number | boolean | Date | null | readonly string[] | readonly GameSetValue[];

export interface RecordRow {
  readonly id: string;
  readonly values: Readonly<Record<string, RecordValue>>;
}

export interface RecordQuery {
  /** Equality per field. On `roles` / `refs` fields: "contains this value". */
  readonly where: Readonly<Record<string, string | boolean | null>>;
  /** Case-insensitive "contains" over these fields, any of them. */
  readonly search?: { readonly term: string; readonly fields: readonly string[] };
  readonly sort: { readonly field: string; readonly dir: "asc" | "desc" };
  readonly skip: number;
  readonly take: number;
}

/**
 * Read access to every table of the Data screens, plus deletes for the tables that have no use case of their own
 * (sign-in methods, codes, rate-limit windows). Rows carry exactly the registry's field keys.
 */
export interface RecordStore {
  list(table: TableKey, query: RecordQuery): Promise<{ rows: RecordRow[]; total: number }>;
  get(table: TableKey, id: string): Promise<RecordRow | null>;
  /** Display names of rows other tables point to (a user's name, a club's name, a game's date). */
  labels(table: TableKey, ids: readonly string[]): Promise<Map<string, string>>;
  remove(table: "authMethods" | "signInCodes" | "rateLimits", id: string): Promise<void>;
}
