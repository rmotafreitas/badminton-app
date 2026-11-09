import type { DataField, DataRow, DataTable, DataValue, Role } from "@bb/contracts";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { useAppContext } from "@/app/context";
import { useSessionUser } from "@/features/auth";
import { ScorePicker } from "@/features/games";
import { CoverAndPhotoField, type ImageChoice } from "@/shared/components/image-field";
import { initials } from "@/shared/components/player-avatar";
import { RolesInput } from "@/shared/components/roles-input";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import { dataOptionsQuery } from "./api";
import { type Refs, useLabel } from "./fields";

export type FormValues = Record<string, DataValue>;
export type FormImages = Record<string, ImageChoice>;

/** `datetime-local` speaks local wall-clock time without a zone; the API speaks ISO instants. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ── Reference picker ─────────────────────────────────────────────────────────

/** Pick a row of another table: a big button that opens a searchable list (thumb-friendly, no tiny dropdown). */
export function RefPicker({
  table,
  value,
  label,
  current,
  onChange,
  allowNone = true,
  placeholder,
  className,
}: {
  table: string;
  value: string | null;
  label: string;
  /** Display name of the current value, when known. */
  current?: string;
  onChange: (id: string | null, name?: string) => void;
  allowNone?: boolean;
  /** Shown when nothing is picked (default "Choose…"). */
  placeholder?: string;
  className?: string;
}) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const options = useQuery({ ...dataOptionsQuery(api, table, q.trim()), enabled: open });
  const pick = (id: string | null, name?: string) => {
    onChange(id, name);
    setOpen(false);
  };
  return (
    <>
      <Button type="button" variant="outline" className={cn("h-11 w-full justify-between font-normal", className)} onClick={() => setOpen(true)} aria-label={label}>
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? (current ?? value) : (placeholder ?? dict.data.pick)}</span>
        <ChevronsUpDown className="size-4 opacity-50" />
      </Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={label}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={dict.data.search} className="h-11 pl-9" />
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {allowNone && (
              <button type="button" className="tap-target w-full rounded-lg px-3 py-3 text-left text-muted-foreground hover:bg-muted" onClick={() => pick(null)}>
                {dict.data.none}
              </button>
            )}
            {options.data?.map((o) => (
              <button
                key={o.id}
                type="button"
                className={cn("tap-target w-full rounded-lg px-3 py-3 text-left hover:bg-muted", o.id === value && "bg-primary/10 font-medium text-primary")}
                onClick={() => pick(o.id, o.label)}
              >
                {o.label}
              </button>
            ))}
            {options.data?.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{dict.data.noMatch}</p>}
          </div>
        </div>
      </ResponsiveSheet>
    </>
  );
}

// ── Sets ─────────────────────────────────────────────────────────────────────

type Set = { team1Score: number; team2Score: number };

/** A game's sets, one tap per score (the same picker as the score form). */
function SetsInput({ value, onChange }: { value: Set[]; onChange: (sets: Set[]) => void }) {
  const dict = useDictionary().ui;
  const [picking, setPicking] = useState<{ index: number; team: 1 | 2 } | null>(null);
  const sets = value.length ? value : [{ team1Score: 21, team2Score: 0 }];
  const set = (index: number, team: 1 | 2, score: number) =>
    onChange(sets.map((s, i) => (i === index ? { ...s, [team === 1 ? "team1Score" : "team2Score"]: score } : s)));
  const current = picking ? sets[picking.index] : undefined;
  return (
    <div className="space-y-2">
      {sets.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-14 text-sm text-muted-foreground">{fmt(dict.data.setN, { n: i + 1 })}</span>
          {([1, 2] as const).map((team) => (
            <Button
              key={team}
              type="button"
              variant="outline"
              className="tabular h-11 flex-1 text-lg font-semibold"
              aria-label={`${fmt(dict.data.setN, { n: i + 1 })}, ${team === 1 ? dict.data.team1 : dict.data.team2}`}
              onClick={() => setPicking({ index: i, team })}
            >
              {team === 1 ? s.team1Score : s.team2Score}
            </Button>
          ))}
          {sets.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={dict.data.remove} onClick={() => onChange(sets.filter((_, j) => j !== i))}>
              <X />
            </Button>
          )}
        </div>
      ))}
      {sets.length < 5 && (
        <Button type="button" variant="ghost" className="h-11" onClick={() => onChange([...sets, { team1Score: 21, team2Score: 0 }])}>
          <Plus /> {dict.data.addSet}
        </Button>
      )}
      {picking && current && (
        <ScorePicker
          open
          onOpenChange={(open) => !open && setPicking(null)}
          title={`${fmt(dict.data.setN, { n: picking.index + 1 })} · ${picking.team === 1 ? dict.data.team1 : dict.data.team2}`}
          value={picking.team === 1 ? current.team1Score : current.team2Score}
          other={picking.team === 1 ? current.team2Score : current.team1Score}
          onPick={(score) => {
            set(picking.index, picking.team, score);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

// ── One field ────────────────────────────────────────────────────────────────

function FieldInput({ field, value, onChange, refs }: { field: DataField; value: DataValue; onChange: (v: DataValue) => void; refs: Refs }) {
  const dict = useDictionary().ui;
  const viewer = useSessionUser();
  const label = useLabel();
  const id = `data-field-${field.key}`;
  switch (field.type) {
    case "boolean":
      return <Switch id={id} checked={!!value} onCheckedChange={onChange} />;
    case "longtext":
      return <Textarea id={id} value={(value as string | null) ?? ""} maxLength={field.max} onChange={(e) => onChange(e.target.value)} rows={3} />;
    case "integer":
    case "number":
    case "bytes":
    case "seconds":
      return (
        <Input
          id={id}
          inputMode={field.type === "number" ? "decimal" : "numeric"}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="h-11"
        />
      );
    case "day":
      return <Input id={id} type="date" value={(value as string | null) ?? ""} onChange={(e) => onChange(e.target.value || null)} className="h-11" />;
    case "datetime":
      return (
        <Input
          id={id}
          type="datetime-local"
          value={toLocalInput(value as string | null)}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="h-11"
        />
      );
    case "enum":
      return (
        <Select value={(value as string | null) ?? undefined} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-11 w-full">
            <SelectValue placeholder={dict.data.pick} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "roles":
      return <RolesInput value={(value as Role[] | null) ?? []} onChange={onChange} canGrantSystemAdmin={viewer.roles.includes("SYSTEM_ADMIN")} />;
    case "ref":
      return (
        <RefPicker
          table={field.ref as string}
          value={(value as string | null) ?? null}
          current={field.ref ? refs[field.ref]?.[value as string] : undefined}
          label={label(field.label)}
          onChange={(next) => onChange(next)}
        />
      );
    case "sets":
      return <SetsInput value={(value as Set[] | null) ?? []} onChange={onChange} />;
    default:
      return (
        <Input
          id={id}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          inputMode={field.type === "email" ? "email" : field.type === "phone" ? "tel" : undefined}
          autoComplete="off"
          value={(value as string | null) ?? ""}
          maxLength={field.max}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
          className="h-11"
        />
      );
  }
}

// ── The form ─────────────────────────────────────────────────────────────────

/** What a new row starts with: roles start as player, sets as one 21–0 set, booleans off, the rest empty. */
export function blankValues(fields: readonly DataField[]): FormValues {
  return Object.fromEntries(
    fields.filter((f) => f.type !== "image").map((f) => [f.key, f.type === "roles" ? ["PLAYER"] : f.type === "boolean" ? false : null]),
  );
}

export const rowValues = (fields: readonly DataField[], row: DataRow): FormValues =>
  Object.fromEntries(fields.filter((f) => f.type !== "image").map((f) => [f.key, row.values[f.key] ?? null]));

/**
 * The editable fields of a table, laid out top to bottom. Images: a cover + photo pair (clubs) shows as the header
 * the user is editing; any other image gets the same widget alone.
 */
export function RecordFields({
  table,
  fields,
  values,
  images,
  current,
  refs,
  onValues,
  onImages,
  formId,
  onSubmit,
}: {
  table: DataTable;
  fields: readonly DataField[];
  values: FormValues;
  images: FormImages;
  current: DataRow | null;
  refs: Refs;
  onValues: (v: FormValues) => void;
  onImages: (i: FormImages) => void;
  formId: string;
  onSubmit: () => void;
}) {
  const dict = useDictionary().ui;
  const label = useLabel();
  const imageFields = fields.filter((f) => f.type === "image");
  const cover = imageFields.find((f) => f.key === "banner");
  const photo = imageFields.find((f) => f.key !== "banner");
  const title = (values[table.titleField] as string | null) ?? "";
  const slot = (f: DataField | undefined) =>
    f && {
      label: label(f.label),
      current: (current?.values[f.key] as string | null) ?? null,
      value: images[f.key],
      onChange: (file: ImageChoice) => onImages({ ...images, [f.key]: file }),
    };
  const coverSlot = slot(cover);
  const photoSlot = slot(photo);
  return (
    <form
      id={formId}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {(coverSlot || photoSlot) && (
        <CoverAndPhotoField
          cover={coverSlot ?? { label: "", current: null, value: undefined, onChange: () => {} }}
          photo={photoSlot ?? { label: "", current: null, value: undefined, onChange: () => {} }}
          removeLabel={dict.data.remove}
          photoShape={table.key === "clubs" ? "rounded" : "circle"}
          fallback={title.trim() ? initials(title) : undefined}
        />
      )}
      {fields
        .filter((f) => f.type !== "image")
        .map((f) => (
          <Field key={f.key} orientation={f.type === "boolean" ? "horizontal" : undefined}>
            <FieldLabel htmlFor={`data-field-${f.key}`}>
              {label(f.label)}
              {f.required && <span className="text-destructive"> *</span>}
            </FieldLabel>
            <FieldInput field={f} value={values[f.key] ?? null} refs={refs} onChange={(v) => onValues({ ...values, [f.key]: v })} />
          </Field>
        ))}
    </form>
  );
}
