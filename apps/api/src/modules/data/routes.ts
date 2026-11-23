import type { ImageUpload } from "@bb/application";
import { BadRequest } from "@bb/domain";
import {
  DataExportQuerySchema,
  DataListQuerySchema,
  DataOptionListSchema,
  DataOptionsQuerySchema,
  DataPageSchema,
  DataRecordParamsSchema,
  DataRecordSchema,
  DataRelatedListSchema,
  DataTableListSchema,
  DataTableParamsSchema,
  DataWriteFormSchema,
  ErrorResponseSchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { type Authentication, toUpload } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentDataPage, presentDataRecord, presentDataTable } from "./presenters";

const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 422: ErrorResponseSchema };

function parseJson(raw: string | undefined, what: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequest(`${what} must be a JSON object.`);
}

const listInput = (query: z.infer<typeof DataListQuerySchema>) => ({
  q: query.q,
  sort: query.sort,
  dir: query.dir,
  page: query.page,
  pageSize: query.pageSize,
  // Elysia parses a JSON-looking query value itself; a plain string still needs parsing.
  filters: (typeof query.filters === "object" ? query.filters : parseJson(query.filters, "filters")) as Record<string, string | boolean | null>,
  view: query.view,
  of: query.of ? { table: query.of.slice(0, query.of.indexOf(":")), id: query.of.slice(query.of.indexOf(":") + 1) } : undefined,
});

async function writeInput(form: z.infer<typeof DataWriteFormSchema>) {
  const { values, ...files } = form;
  const uploads: Record<string, ImageUpload> = {};
  for (const [key, file] of Object.entries(files)) {
    const upload = await toUpload(file as File | undefined);
    if (upload) uploads[key] = upload;
  }
  return { values: typeof values === "string" ? parseJson(values, "values") : values, uploads };
}

/**
 * The generic Data screens: `/api/data` lists the tables the caller may open; each table has list, export pages, get,
 * related counts, create, update and delete. What a caller may see and change comes from the registry and the use cases.
 */
export function dataRoutes(auth: Authentication, deps: ApiDeps) {
  const data = deps.dataTables;
  return new Elysia({ name: "module.data", prefix: "/data" })
    .use(auth)
    .get("/", ({ actor }) => data.describe({ actor }).map(presentDataTable), {
      auth: true,
      response: { 200: DataTableListSchema, ...errors },
    })
    .get("/:table", async ({ actor, params, query }) => presentDataPage(await data.list({ actor, table: params.table, ...listInput(query) })), {
      auth: true,
      params: DataTableParamsSchema,
      query: DataListQuerySchema,
      response: { 200: DataPageSchema, ...errors },
    })
    // One big page of an export; the browser builds the Excel / CSV file from these.
    .get("/:table/export", async ({ actor, params, query }) => presentDataPage(await data.exportPage({ actor, table: params.table, ...listInput(query) })), {
      auth: true,
      params: DataTableParamsSchema,
      query: DataExportQuerySchema,
      response: { 200: DataPageSchema, ...errors },
    })
    .get("/:table/options", async ({ actor, params, query }) => data.options({ actor, table: params.table, q: query.q }), {
      auth: true,
      params: DataTableParamsSchema,
      query: DataOptionsQuerySchema,
      response: { 200: DataOptionListSchema, ...errors },
    })
    .get("/:table/:id", async ({ actor, params }) => presentDataRecord(await data.get({ actor, table: params.table, id: params.id })), {
      auth: true,
      params: DataRecordParamsSchema,
      response: { 200: DataRecordSchema, ...errors },
    })
    .get("/:table/:id/related", async ({ actor, params }) => data.related({ actor, table: params.table, id: params.id }), {
      auth: true,
      params: DataRecordParamsSchema,
      response: { 200: DataRelatedListSchema, ...errors },
    })
    .post(
      "/:table",
      async ({ actor, params, body }) => presentDataRecord(await data.create({ actor, table: params.table, ...(await writeInput(body)) })),
      { auth: true, params: DataTableParamsSchema, body: DataWriteFormSchema, response: { 200: DataRecordSchema, ...errors } },
    )
    .patch(
      "/:table/:id",
      async ({ actor, params, body }) =>
        presentDataRecord(await data.update({ actor, table: params.table, id: params.id, ...(await writeInput(body)) })),
      { auth: true, params: DataRecordParamsSchema, body: DataWriteFormSchema, response: { 200: DataRecordSchema, ...errors } },
    )
    .delete(
      "/:table/:id",
      async ({ actor, params, status }) => {
        await data.delete({ actor, table: params.table, id: params.id });
        return status(204, undefined);
      },
      { auth: true, params: DataRecordParamsSchema, response: { 204: z.void(), ...errors } },
    );
}
