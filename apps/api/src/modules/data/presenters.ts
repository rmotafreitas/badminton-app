import type { FieldDef, RecordPage, RecordRow, RecordValue, TableView } from "@bb/application";
import type { DataPage, DataRecord, DataRow, DataTable, DataValue } from "@bb/contracts";
import { clubImageUrl, profileImageUrl } from "@/http";

export const presentDataTable = (t: TableView): DataTable => ({
  key: t.def.key,
  label: t.def.label,
  icon: t.def.icon,
  titleField: t.def.titleField,
  defaultSort: t.def.defaultSort,
  fields: t.def.fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    ref: f.ref,
    options: f.options ? [...f.options] : undefined,
    list: !!f.list,
    search: !!f.search,
    sort: !!f.sort,
    filter: !!f.filter,
    required: !!f.required,
    min: f.min,
    max: f.max,
  })),
  scope: t.scope,
  canCreate: t.canCreate,
  canUpdate: t.canUpdate,
  canDelete: t.canDelete,
  createFields: [...t.createFields],
  editFields: [...t.editFields],
  deleteLabel: t.deleteLabel ?? null,
  deleteHint: t.def.deleteHint ?? null,
});

function presentValue(field: FieldDef, rowId: string, value: RecordValue | undefined): DataValue {
  if (value === undefined || value === null) return null;
  if (field.type === "image" && field.image && typeof value === "string") {
    return field.image.owner === "club"
      ? clubImageUrl(rowId, field.image.kind as "picture" | "banner", value)
      : profileImageUrl(rowId, field.image.kind as "photo" | "banner", value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" ? { ...v } : v)) as DataValue;
  return value as DataValue;
}

const presentRow = (fields: readonly FieldDef[], row: RecordRow): DataRow => ({
  id: row.id,
  values: Object.fromEntries(fields.map((f) => [f.key, presentValue(f, row.id, row.values[f.key])])),
});

const presentRefs = (refs: RecordPage["refs"]) => refs as Record<string, Record<string, string>>;

export const presentDataPage = (p: RecordPage): DataPage => ({
  table: presentDataTable(p.table),
  rows: p.rows.map((r) => presentRow(p.table.def.fields, r)),
  total: p.total,
  page: p.page,
  pageSize: p.pageSize,
  refs: presentRefs(p.refs),
});

export const presentDataRecord = (r: { table: TableView; row: RecordRow; refs: RecordPage["refs"] }): DataRecord => ({
  table: presentDataTable(r.table),
  row: presentRow(r.table.def.fields, r.row),
  refs: presentRefs(r.refs),
});

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Spreadsheet formula injection: a cell starting with = + - @ would run as a formula in Excel/Sheets. */
const cell = (text: string) => {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

function csvText(field: FieldDef, value: RecordValue | undefined, refs: RecordPage["refs"]): string {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  const name = (id: string) => (field.ref && refs[field.ref]?.[id]) || id;
  switch (field.type) {
    case "ref":
      return name(String(value));
    case "refs":
      return (value as string[]).map(name).join(" / ");
    case "roles":
      return (value as string[]).join(" ");
    case "sets":
      return (value as { team1Score: number; team2Score: number }[]).map((s) => `${s.team1Score}-${s.team2Score}`).join(" ");
    default:
      return String(value);
  }
}

/** Every exportable column (images aren't), with a UTF-8 BOM so Excel reads accents right. */
export function dataCsv(page: RecordPage, lang: "en" | "pt"): string {
  const fields = page.table.def.fields.filter((f) => f.type !== "image");
  const lines = [
    ["id", ...fields.map((f) => f.label[lang])].map(cell).join(","),
    ...page.rows.map((row) => [row.id, ...fields.map((f) => csvText(f, row.values[f.key], page.refs))].map(cell).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
