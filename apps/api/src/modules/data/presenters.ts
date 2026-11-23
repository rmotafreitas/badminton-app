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
    options: f.options?.map((value) => ({ value, label: f.optionLabels?.[value] ?? { en: value, pt: value } })),
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
  views: t.views.map((v) => ({ key: v.key, label: v.label })),
  related: t.related.map((r) => ({ table: r.table, label: r.label })),
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
  ...(p.of && { of: { ...p.of } }),
});

export const presentDataRecord = (r: { table: TableView; row: RecordRow; refs: RecordPage["refs"] }): DataRecord => ({
  table: presentDataTable(r.table),
  row: presentRow(r.table.def.fields, r.row),
  refs: presentRefs(r.refs),
});
