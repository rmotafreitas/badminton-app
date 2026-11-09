import type { PersonalDetails, RegistrationSheet } from "@bb/contracts";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";
import { registrationKeys, saveDetails } from "./api";
import { isMinor } from "./download";

type Key = Exclude<keyof PersonalDetails, "sex">;

/** Field order and input hints. Numbers get the numeric keypad; dates the date picker. */
const FIELDS: { key: Key; type?: string; inputMode?: "numeric" | "email" | "tel"; autoComplete?: string; wide?: boolean }[] = [
  { key: "fullName", autoComplete: "name", wide: true },
  { key: "birthday", type: "date", autoComplete: "bday" },
  { key: "nationality" },
  { key: "address", autoComplete: "street-address", wide: true },
  { key: "postalCode", inputMode: "numeric", autoComplete: "postal-code" },
  { key: "locality", autoComplete: "address-level2" },
  { key: "municipality" },
  { key: "idNumber", inputMode: "numeric" },
  { key: "idValidUntil", type: "date" },
  { key: "nif", inputMode: "numeric" },
  { key: "phone", type: "tel", inputMode: "tel", autoComplete: "tel" },
  { key: "email", type: "email", inputMode: "email", autoComplete: "email" },
  { key: "profession", wide: true },
];

/** Every blank of the form, for "N fields still empty". */
export const PERSON_KEYS: (keyof PersonalDetails)[] = ["sex", ...FIELDS.map((f) => f.key)];

/** "4405663" → "4405-663" as you type. */
const postal = (v: string) => {
  const digits = v.replace(/\D/g, "").slice(0, 7);
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
};

function PersonFields({ prefix, value, onChange }: { prefix: string; value: PersonalDetails; onChange: (v: PersonalDetails) => void }) {
  const t = useDictionary().ui.registration;
  const set = (key: keyof PersonalDetails, v: string | null) => onChange({ ...value, [key]: v === "" ? null : v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2">
        <FieldLabel>{t.sex}</FieldLabel>
        <div className="flex gap-2">
          {(["M", "F"] as const).map((sex) => (
            <button
              key={sex}
              type="button"
              aria-pressed={value.sex === sex}
              onClick={() => onChange({ ...value, sex: value.sex === sex ? null : sex })}
              className={cn(
                "tap-target h-11 w-16 rounded-full border text-sm font-semibold transition-colors",
                value.sex === sex ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {sex}
            </button>
          ))}
        </div>
      </Field>
      {FIELDS.map((f) => (
        <Field key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
          <FieldLabel htmlFor={`${prefix}-${f.key}`}>{t[f.key]}</FieldLabel>
          <Input
            id={`${prefix}-${f.key}`}
            type={f.type ?? "text"}
            inputMode={f.inputMode}
            autoComplete={prefix === "athlete" ? f.autoComplete : "off"}
            value={value[f.key] ?? ""}
            onChange={(e) => set(f.key, f.key === "postalCode" ? postal(e.target.value) : e.target.value)}
            placeholder={f.key === "postalCode" ? "0000-000" : undefined}
            className="h-11"
          />
        </Field>
      ))}
    </div>
  );
}

const EMPTY: PersonalDetails = {
  fullName: null,
  sex: null,
  birthday: null,
  nationality: null,
  address: null,
  locality: null,
  municipality: null,
  postalCode: null,
  idNumber: null,
  idValidUntil: null,
  nif: null,
  phone: null,
  email: null,
  profession: null,
};

/**
 * Editing the details the form prints. Typed once, then kept for every season. The guardian block shows for minors
 * (or when one was saved), and can be added by hand.
 */
export function DetailsSheet({ sheet, userId, onClose }: { sheet: RegistrationSheet; userId?: string; onClose: () => void }) {
  const dict = useDictionary().ui;
  const t = dict.registration;
  const { api, queryClient } = useAppContext();
  const [person, setPerson] = useState<PersonalDetails>({ ...sheet.person });
  const [nib, setNib] = useState(sheet.nib ?? "");
  const [guardian, setGuardian] = useState<PersonalDetails | null>(sheet.guardian ?? (isMinor(sheet.person.birthday) ? { ...EMPTY } : null));
  const save = useMutation({
    mutationFn: () => saveDetails(api, userId, { person, nib: nib.trim() || null, guardian }),
    onSuccess: (saved) => {
      queryClient.setQueryData(userId ? registrationKeys.member(userId) : registrationKeys.me(), saved);
      toast.success(t.saved);
      onClose();
    },
  });
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={userId ? fmt(t.memberDetailsTitle, { name: sheet.member.name ?? "" }) : t.details}
      description={t.detailsHint}
      footer={
        <Button type="submit" form="registration-details" className="h-12 w-full text-base" disabled={save.isPending}>
          {save.isPending && <Spinner />} {dict.common.save}
        </Button>
      }
    >
      <form
        id="registration-details"
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <section className="space-y-4">
          <h3 className="font-semibold">{t.athlete}</h3>
          <PersonFields prefix="athlete" value={person} onChange={setPerson} />
          <Field>
            <FieldLabel htmlFor="athlete-nib">{t.nib}</FieldLabel>
            <Input id="athlete-nib" autoComplete="off" value={nib} onChange={(e) => setNib(e.target.value)} className="h-11" />
          </Field>
        </section>
        <section className="space-y-4 border-t pt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{t.guardian}</h3>
            {guardian ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setGuardian(null)}>
                <X /> {t.removeGuardian}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setGuardian({ ...EMPTY })}>
                <Plus /> {t.addGuardian}
              </Button>
            )}
          </div>
          {guardian ? (
            <>
              <FieldDescription>{t.guardianHint}</FieldDescription>
              <PersonFields prefix="guardian" value={guardian} onChange={setGuardian} />
            </>
          ) : (
            <FieldDescription>{t.guardianHint}</FieldDescription>
          )}
        </section>
        {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
      </form>
    </ResponsiveSheet>
  );
}
