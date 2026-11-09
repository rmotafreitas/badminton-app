import type { ImageUpload, RecordPage } from "@bb/application";
import { BadRequest } from "@bb/domain";
import {
  DataListQuerySchema,
  DataOptionListSchema,
  DataOptionsQuerySchema,
  DataPageSchema,
  DataRecordParamsSchema,
  DataRecordSchema,
  DataTableListSchema,
  DataTableParamsSchema,
  DataWriteFormSchema,
  ErrorResponseSchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { type Authentication, toUpload } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { dataCsv, presentDataPage, presentDataRecord, presentDataTable } from "./presenters";

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

const csvName = (page: RecordPage) => `${page.table.def.key}-${new Date().toISOString().slice(0, 10)}.csv`;

/**
 * The generic Data screens: `/api/data` lists the tables the caller may open; each table has list, export, get,
 * create, update and delete. What a caller may see and change comes from the registry and the use cases.
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
    .get(
      "/:table/export",
      async ({ actor, params, query }) => {
        const { page: _page, pageSize: _size, ...input } = listInput(query);
        const page = await data.export({ actor, table: params.table, ...input });
        const lang = query.lang === "pt" ? "pt" : "en";
        return new Response(dataCsv(page, lang), {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${csvName(page)}"`,
          },
        });
      },
      {
        auth: true,
        params: DataTableParamsSchema,
        query: DataListQuerySchema.extend({ lang: z.enum(["en", "pt"]).optional() }),
        response: errors,
      },
    )
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
