import { z } from "zod";
import { ImageFileSchema } from "./common";

/** The generic Data screens: table definitions the caller may open, pages of rows, and writes. */

export const LabelSchema = z.object({ en: z.string(), pt: z.string() });
export type Label = z.infer<typeof LabelSchema>;

export const DataFieldTypeSchema = z.enum([
  "text",
  "longtext",
  "email",
  "phone",
  "integer",
  "number",
  "boolean",
  "day",
  "datetime",
  "enum",
  "roles",
  "ref",
  "refs",
  "image",
  "sets",
  "bytes",
  "seconds",
]);
export type DataFieldType = z.infer<typeof DataFieldTypeSchema>;

export const DataFieldSchema = z.object({
  key: z.string(),
  label: LabelSchema,
  type: DataFieldTypeSchema,
  ref: z.string().optional(),
  options: z.array(z.string()).optional(),
  list: z.boolean(),
  search: z.boolean(),
  sort: z.boolean(),
  filter: z.boolean(),
  required: z.boolean(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type DataField = z.infer<typeof DataFieldSchema>;

export const DataTableSchema = z.object({
  key: z.string(),
  label: LabelSchema,
  icon: z.string(),
  titleField: z.string(),
  defaultSort: z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) }),
  fields: z.array(DataFieldSchema),
  /** `club`: the caller only sees their own club's rows. */
  scope: z.enum(["all", "club"]),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  createFields: z.array(z.string()),
  editFields: z.array(z.string()),
  deleteLabel: LabelSchema.nullable(),
  deleteHint: LabelSchema.nullable(),
});
export type DataTable = z.infer<typeof DataTableSchema>;
export const DataTableListSchema = z.array(DataTableSchema);

/**
 * A cell. Dates are ISO strings, images are URLs (`/api/media/...`), sets are `{ team1Score, team2Score }[]`,
 * `ref` is an id (its display name is in `refs`), `refs`/`roles` are string arrays.
 */
export const DataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.array(z.object({ team1Score: z.number(), team2Score: z.number() })),
]);
export type DataValue = z.infer<typeof DataValueSchema>;

export const DataRowSchema = z.object({ id: z.string(), values: z.record(z.string(), DataValueSchema) });
export type DataRow = z.infer<typeof DataRowSchema>;

/** Display names of referenced rows: `refs[table][id]`. */
export const DataRefsSchema = z.record(z.string(), z.record(z.string(), z.string()));

export const DataPageSchema = z.object({
  table: DataTableSchema,
  rows: z.array(DataRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  refs: DataRefsSchema,
});
export type DataPage = z.infer<typeof DataPageSchema>;

export const DataRecordSchema = z.object({ table: DataTableSchema, row: DataRowSchema, refs: DataRefsSchema });
export type DataRecord = z.infer<typeof DataRecordSchema>;

export const DataTableParamsSchema = z.object({ table: z.string().max(40) });
export const DataRecordParamsSchema = z.object({ table: z.string().max(40), id: z.string().max(40) });

export const DataListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  /** JSON object of `field: value` equality filters (`null` = empty). */
  filters: z.union([z.string().max(2000), z.record(z.string(), z.union([z.string(), z.boolean(), z.null()]))]).optional(),
});
export type DataListQuery = z.infer<typeof DataListQuerySchema>;

export const DataOptionsQuerySchema = z.object({ q: z.string().max(100).optional() });
export const DataOptionSchema = z.object({ id: z.string(), label: z.string() });
export type DataOption = z.infer<typeof DataOptionSchema>;
export const DataOptionListSchema = z.array(DataOptionSchema);

/**
 * Create / update are multipart: `values` is a JSON object of the fields to set (`null` clears one), and each image
 * field is a file part named after the field (an empty file removes the image).
 */
export const DataWriteFormSchema = z
  .object({
    // Elysia already parses a JSON-looking multipart part, so it may arrive as an object.
    values: z.union([z.string().max(100_000), z.record(z.string(), z.unknown())]).default("{}"),
  })
  .catchall(ImageFileSchema);
