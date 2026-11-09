import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireRole } from "@/features/auth";
import { type DataSearch, DataTablePage, type Filters } from "@/features/data";

const str = (v: unknown, max = 100) => (typeof v === "string" && v.length <= max ? v : undefined);

/** Search, sort, page and filters live in the URL; anything malformed is simply dropped. */
function validateSearch(search: Record<string, unknown>): DataSearch {
  const page = Number(search.page);
  const filters = search.filters;
  const okFilters =
    filters && typeof filters === "object" && !Array.isArray(filters) && Object.values(filters).every((v) => ["string", "boolean"].includes(typeof v) || v === null)
      ? (filters as Filters)
      : undefined;
  return {
    q: str(search.q) || undefined,
    sort: str(search.sort, 40),
    dir: search.dir === "asc" || search.dir === "desc" ? search.dir : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    filters: okFilters && Object.keys(okFilters).length ? okFilters : undefined,
  };
}

export const Route = createFileRoute("/_app/data/$table")({
  beforeLoad: ({ context }) => requireRole(context.user, "SYSTEM_ADMIN", "CLUB_ADMIN", "COACH"),
  validateSearch,
  component: DataTable,
});

function DataTable() {
  const { table } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <DataTablePage key={table} tableKey={table} search={search} onSearch={(next) => void navigate({ search: next, replace: true })} />;
}
