import { BadRequest, isObjectId, ROLES, type Role } from "@bb/domain";
import type { GameSetValue, RecordValue } from "./ports";
import type { FieldDef } from "./registry";

const bad = (field: FieldDef, why: string) => new BadRequest(`${field.label.en}: ${why}`, "invalid_value");

const text = (field: FieldDef, raw: unknown): string | null => {
  if (raw === null) return null;
  if (typeof raw !== "string") throw bad(field, "expected text.");
  const value = raw.trim();
  if (field.max !== undefined && value.length > field.max) throw bad(field, `at most ${field.max} characters.`);
  if (value && field.min !== undefined && value.length < field.min) throw bad(field, `at least ${field.min} characters.`);
  return value || null;
};

const number = (field: FieldDef, raw: unknown, integer: boolean): number | null => {
  if (raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) throw bad(field, "expected a number.");
  if (field.min !== undefined && value < field.min) throw bad(field, `at least ${field.min}.`);
  if (field.max !== undefined && value > field.max) throw bad(field, `at most ${field.max}.`);
  return value;
};

const id = (field: FieldDef, raw: unknown): string | null => {
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string" || !isObjectId(raw)) throw bad(field, "expected an id.");
  return raw;
};

function sets(field: FieldDef, raw: unknown): GameSetValue[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5) throw bad(field, "expected 1 to 5 sets.");
  return raw.map((s) => {
    const a = (s as GameSetValue | null)?.team1Score;
    const b = (s as GameSetValue | null)?.team2Score;
    if (![a, b].every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 99)) throw bad(field, "scores are 0 to 99.");
    return { team1Score: a as number, team2Score: b as number };
  });
}

/** One field's submitted value, checked against its type. `null` clears it. */
export function parseValue(field: FieldDef, raw: unknown): RecordValue {
  switch (field.type) {
    case "text":
    case "longtext":
    case "email":
    case "phone":
      return text(field, raw);
    case "integer":
    case "bytes":
      return number(field, raw, true);
    case "number":
    case "seconds":
      return number(field, raw, false);
    case "boolean":
      if (typeof raw !== "boolean") throw bad(field, "expected yes or no.");
      return raw;
    case "day":
      if (raw === null) return null;
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw bad(field, "use YYYY-MM-DD.");
      return raw;
    case "datetime": {
      if (raw === null) return null;
      const date = typeof raw === "string" ? new Date(raw) : null;
      if (!date || Number.isNaN(date.getTime())) throw bad(field, "expected a date and time.");
      return date;
    }
    case "enum":
      if (raw === null) return null;
      if (typeof raw !== "string" || !field.options?.includes(raw)) throw bad(field, "not one of the options.");
      return raw;
    case "roles":
      if (!Array.isArray(raw) || !raw.every((r): r is Role => (ROLES as readonly unknown[]).includes(r))) throw bad(field, "unknown role.");
      return [...new Set(raw)];
    case "ref":
      return id(field, raw);
    case "refs":
      if (!Array.isArray(raw)) throw bad(field, "expected a list of ids.");
      return raw.map((r) => id(field, r)).filter((r): r is string => r !== null);
    case "sets":
      return sets(field, raw);
    case "image":
      throw bad(field, "send images as files.");
  }
}

/**
 * The submitted values, keeping only fields the caller may set (anything else is an error, not silently dropped,
 * so a client bug shows up). Required fields must be present on create.
 */
export function parseValues(
  fields: readonly FieldDef[],
  raw: Readonly<Record<string, unknown>>,
  mode: "create" | "edit",
): Record<string, RecordValue> {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: Record<string, RecordValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = byKey.get(key);
    if (!field || field.type === "image") throw new BadRequest(`You can't set "${key}" here.`, "field_not_editable");
    if (value === undefined) continue;
    out[key] = parseValue(field, value);
  }
  for (const field of fields) {
    const value = out[field.key];
    const missing = value === null || value === "" || (mode === "create" && value === undefined);
    if (field.required && missing) throw bad(field, "required.");
  }
  return out;
}
