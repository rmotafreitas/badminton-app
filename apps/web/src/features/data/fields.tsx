import type { DataField, DataRow, DataTable, DataValue, Label, Role } from "@bb/contracts";
import {
  Building2,
  CalendarCheck,
  Check,
  Database,
  Gauge,
  KeyRound,
  type LucideIcon,
  Mail,
  Minus,
  Monitor,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";

export type Refs = Record<string, Record<string, string>>;

const ICONS: Record<string, LucideIcon> = {
  building: Building2,
  users: Users,
  trophy: Trophy,
  calendar: CalendarCheck,
  video: Video,
  key: KeyRound,
  monitor: Monitor,
  mail: Mail,
  gauge: Gauge,
};
export const tableIcon = (icon: string): LucideIcon => ICONS[icon] ?? Database;

/** The label in the UI language ("pt-PT" → pt, anything else → en). */
export function useLabel() {
  const { lang } = useLanguage();
  const short = lang.startsWith("pt") ? ("pt" as const) : ("en" as const);
  return Object.assign((label: Label) => label[short], { lang: short, locale: lang });
}

export const fieldOf = (table: DataTable, key: string) => table.fields.find((f) => f.key === key);
export const listedFields = (table: DataTable) => table.fields.filter((f) => f.list);

type Sets = { team1Score: number; team2Score: number }[];

const bytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`);
const seconds = (n: number) => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, "0")}`;

/** Plain text for a value: what search results, mobile cards and the detail sheet's title show. */
export function useFormatValue() {
  const dict = useDictionary().ui;
  const label = useLabel();
  return (field: DataField, value: DataValue | undefined, refs: Refs): string => {
    if (value === null || value === undefined || value === "") return "";
    switch (field.type) {
      case "datetime":
        return new Date(value as string).toLocaleString(label.locale, { dateStyle: "medium", timeStyle: "short" });
      case "day":
        return new Date(`${value as string}T12:00:00`).toLocaleDateString(label.locale, { dateStyle: "medium" });
      case "boolean":
        return value ? dict.data.yes : dict.data.no;
      case "number":
        return (value as number).toLocaleString(label.locale, { maximumFractionDigits: 1 });
      case "integer":
        return (value as number).toLocaleString(label.locale);
      case "bytes":
        return bytes(value as number);
      case "seconds":
        return seconds(value as number);
      case "roles":
        return (value as Role[]).map((r) => dict.roles[r] ?? r).join(", ");
      case "ref":
        return (field.ref && refs[field.ref]?.[value as string]) || (value as string);
      case "refs":
        return (value as string[]).map((id) => (field.ref && refs[field.ref]?.[id]) || id).join(", ");
      case "sets":
        return (value as Sets).map((s) => `${s.team1Score}–${s.team2Score}`).join("  ");
      case "image":
        return "";
      default:
        return String(value);
    }
  };
}

/** A row's name: its title field, or the first listed text value, or its id. */
export function useRowTitle() {
  const format = useFormatValue();
  return (table: DataTable, row: DataRow, refs: Refs) => {
    const title = fieldOf(table, table.titleField);
    const text = title ? format(title, row.values[title.key], refs) : "";
    if (text) return text;
    for (const f of listedFields(table)) {
      const v = format(f, row.values[f.key], refs);
      if (v) return v;
    }
    return row.id.slice(-6);
  };
}

/** A table cell / detail value, with badges, avatars and icons where they read better than text. */
export function FieldValue({ field, row, refs, title, className }: { field: DataField; row: DataRow; refs: Refs; title?: string; className?: string }) {
  const dict = useDictionary().ui;
  const format = useFormatValue();
  const value = row.values[field.key];
  if (field.type === "image") {
    const rounded = field.key === "picture" ? "rounded-lg" : undefined;
    if (field.key === "banner") {
      return value ? <img src={value as string} alt="" className={cn("h-10 w-28 rounded-md object-cover", className)} /> : <Empty />;
    }
    return <PlayerAvatar id={row.id} name={title ?? null} photoUrl={(value as string | null) ?? null} className={cn("size-8", rounded, className)} />;
  }
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return <Empty />;
  if (field.type === "boolean") {
    return value ? <Check className="size-4 text-primary" aria-label={dict.data.yes} /> : <Minus className="size-4 text-muted-foreground" aria-label={dict.data.no} />;
  }
  if (field.type === "roles") {
    return (
      <span className={cn("flex flex-wrap gap-1", className)}>
        {(value as Role[]).map((r) => (
          <Badge key={r} variant={r === "PLAYER" ? "secondary" : "default"} className={r === "PLAYER" ? "" : "bg-primary/12 text-primary hover:bg-primary/12"}>
            {dict.roles[r] ?? r}
          </Badge>
        ))}
      </span>
    );
  }
  if (field.type === "enum") {
    return (
      <Badge variant="outline" className={className}>
        {value as string}
      </Badge>
    );
  }
  const numeric = ["number", "integer", "bytes", "seconds"].includes(field.type);
  return <span className={cn(numeric && "tabular", field.type === "sets" && "tabular font-medium", className)}>{format(field, value, refs)}</span>;
}

function Empty() {
  return <span className="text-muted-foreground">—</span>;
}
