import type { DataField, DataRow, DataTable, Role } from "@bb/contracts";
import { useDictionary } from "@/shared/i18n";
import type { ExportCell } from "@/shared/lib/export/sheet";
import { optionLabel, type Refs, useLabel } from "./fields";

type Sets = { team1Score: number; team2Score: number }[];

/**
 * A table's export: every field the caller may see except images, in registry order, with values as people read them
 * (names for references, translated options and yes/no) and numbers and dates kept as numbers and dates.
 */
export function useTableExport(table: DataTable | undefined) {
  const dict = useDictionary().ui;
  const label = useLabel();
  const fields = table?.fields.filter((f) => f.type !== "image") ?? [];
  const headers = ["id", ...fields.map((f) => label(f.label))];

  const cell = (field: DataField, value: DataRow["values"][string] | undefined, refs: Refs): ExportCell => {
    if (value === null || value === undefined || value === "") return null;
    const name = (id: string) => (field.ref && refs[field.ref]?.[id]) || id;
    switch (field.type) {
      case "integer":
      case "number":
      case "bytes":
      case "seconds":
        return typeof value === "number" ? value : null;
      case "boolean":
        return value ? dict.data.yes : dict.data.no;
      case "datetime":
        return new Date(value as string);
      case "day":
        return { day: value as string };
      case "enum":
        return optionLabel(field, value as string, label.lang);
      case "roles":
        return (value as Role[]).map((r) => dict.roles[r] ?? r).join(", ");
      case "ref":
        return name(value as string);
      case "refs":
        return (value as string[]).map(name).join(", ");
      case "sets":
        return (value as Sets).map((s) => `${s.team1Score}-${s.team2Score}`).join(" ");
      default:
        return String(value);
    }
  };

  const cells = (row: DataRow, refs: Refs): ExportCell[] => [row.id, ...fields.map((f) => cell(f, row.values[f.key], refs))];
  return { headers, cells };
}
