import type { ClubRegistrationList, Registration, RegistrationCategory, RegistrationForm } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Download, ExternalLink, FileUp, Settings2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { Page, PageHeader } from "@/shared/components/page-header";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { normalizeSearch } from "@/shared/lib/search";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import {
  clubRegistrationsQuery,
  deleteRegistration,
  invalidateRegistrations,
  memberRegistrationQuery,
  registrationFormQuery,
  registrationKeys,
  removeSignedFile,
  signedFileUrl,
  updateRegistration,
  updateRegistrationForm,
  uploadSignedFile,
} from "./api";
import { DetailsSheet } from "./details-sheet";
import { CategoryChips, missingCount, useDownloadForm } from "./registration-page";

type Row = ClubRegistrationList["rows"][number];
type Filter = "all" | "none" | "pending" | "received" | "approved";

const statusOf = (r: Registration | null): Exclude<Filter, "all"> => (r ? r.status : "none");

function StatusBadge({ registration }: { registration: Registration | null }) {
  const t = useDictionary().ui.registration;
  const status = statusOf(registration);
  const label = { none: t.badgeNone, pending: t.badgePending, received: t.badgeReceived, approved: t.badgeApproved }[status];
  return (
    <Badge
      variant={status === "approved" ? "default" : "secondary"}
      className={cn(
        status === "received" && "bg-primary/12 text-primary hover:bg-primary/12",
        status === "pending" && "bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
      )}
    >
      {label}
    </Badge>
  );
}

/** One member's registration from the club's side: their form, the signed paper, approval, notes. */
function MemberSheet({ row, clubId, storageConfigured, onClose }: { row: Row; clubId: string; storageConfigured: boolean; onClose: () => void }) {
  const dict = useDictionary().ui;
  const t = dict.registration;
  const { api, queryClient } = useAppContext();
  const sheet = useQuery(memberRegistrationQuery(api, row.member.id));
  const registration = sheet.data?.registration ?? row.registration;
  const [categories, setCategories] = useState<RegistrationCategory[]>([...(registration?.categories ?? [])]);
  const [notes, setNotes] = useState(registration?.notes ?? "");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const download = useDownloadForm(sheet.data, row.member.id);

  /** Writes the server's answer into the member's sheet and the club list at once. */
  const remember = (updated: Registration | null) => {
    if (sheet.data) queryClient.setQueryData(registrationKeys.member(row.member.id), { ...sheet.data, registration: updated });
    queryClient.setQueryData<ClubRegistrationList>(registrationKeys.club(clubId), (list) =>
      list && { ...list, rows: list.rows.map((r) => (r.member.id === row.member.id ? { ...r, registration: updated } : r)) },
    );
    invalidateRegistrations(queryClient);
  };
  const update = useMutation({
    mutationFn: (changes: { signedReceived?: boolean; approved?: boolean; notes?: string | null }) => updateRegistration(api, registration!.id, changes),
    onSuccess: (r) => {
      remember(r);
      toast.success(t.updated);
    },
    onError: (e) => toast.error(e.message),
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadSignedFile(api, registration!.id, file),
    onSuccess: (r) => {
      remember(r);
      toast.success(t.uploaded);
    },
    onError: (e) => toast.error(e.message),
  });
  const removeScan = useMutation({ mutationFn: () => removeSignedFile(api, registration!.id), onSuccess: remember, onError: (e) => toast.error(e.message) });
  const remove = useMutation({
    mutationFn: () => deleteRegistration(api, registration!.id),
    onSuccess: () => {
      remember(null);
      toast.success(t.deleted);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const openScan = async () => {
    // Open the tab inside the tap (popup blockers), then point it at the short-lived link.
    const tab = window.open("", "_blank");
    try {
      const { url } = await signedFileUrl(api, registration!.id);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error((e as Error).message);
    }
  };

  const name = row.member.name || row.member.email || dict.common.unknownPlayer;
  const approved = registration?.status === "approved";
  return (
    <>
      <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={name} description={registration ? `${t.season} ${registration.season}` : undefined}>
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t.categoriesFor}</h3>
            <CategoryChips value={approved ? [...(registration?.categories ?? [])] : categories} onChange={setCategories} disabled={approved} />
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-11"
                disabled={!sheet.data || download.isPending || (!approved && categories.length === 0)}
                onClick={() => download.mutate(approved ? [...(registration?.categories ?? [])] : categories)}
              >
                {download.isPending ? <Spinner /> : <Download />} {registration ? t.downloadFor : t.start}
              </Button>
              <Button variant="outline" className="h-11" disabled={!sheet.data} onClick={() => setEditing(true)}>
                {t.editDetails}
              </Button>
            </div>
            {sheet.data && missingCount(sheet.data) > 0 && <p className="text-sm text-muted-foreground">{fmt(t.missing, { count: missingCount(sheet.data) })}</p>}
          </section>

          {registration && (
            <>
              <section className="space-y-4 border-t pt-5">
                <Field orientation="horizontal">
                  <Switch id="reg-received" checked={registration.signedReceived} disabled={update.isPending} onCheckedChange={(v) => update.mutate({ signedReceived: v })} />
                  <div>
                    <FieldLabel htmlFor="reg-received">{t.received}</FieldLabel>
                    <FieldDescription>{t.receivedHint}</FieldDescription>
                  </div>
                </Field>
                <Field orientation="horizontal">
                  <Switch
                    id="reg-approved"
                    checked={approved}
                    disabled={update.isPending || !registration.signedReceived}
                    onCheckedChange={(v) => update.mutate({ approved: v })}
                  />
                  <div>
                    <FieldLabel htmlFor="reg-approved">{t.approved}</FieldLabel>
                    <FieldDescription>{t.approvedHint}</FieldDescription>
                  </div>
                </Field>
              </section>

              <section className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-semibold">{t.scan}</h3>
                {storageConfigured ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="application/pdf,image/*"
                      className="sr-only"
                      // The visible button opens it; hidden from assistive tech so it isn't announced twice.
                      aria-hidden="true"
                      tabIndex={-1}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) upload.mutate(file);
                      }}
                    />
                    <Button variant="outline" className="h-11" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
                      {upload.isPending ? <Spinner /> : <FileUp />} {upload.isPending ? t.uploading : t.upload}
                    </Button>
                    {registration.hasSignedFile && (
                      <>
                        <Button variant="outline" className="h-11" onClick={openScan}>
                          <ExternalLink /> {t.openScan}
                        </Button>
                        <Button variant="ghost" className="h-11" disabled={removeScan.isPending} onClick={() => removeScan.mutate()}>
                          {t.removeScan}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t.noStorage}</p>
                )}
              </section>

              <section className="space-y-2 border-t pt-5">
                <FieldLabel htmlFor="reg-notes">{t.notes}</FieldLabel>
                <Textarea id="reg-notes" value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} />
                {(notes || null) !== (registration.notes || null) && (
                  <Button variant="outline" className="h-10" disabled={update.isPending} onClick={() => update.mutate({ notes: notes.trim() || null })}>
                    {dict.common.save}
                  </Button>
                )}
              </section>

              <Button variant="ghost" className="h-11 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> {t.deleteRegistration}
              </Button>
            </>
          )}
        </div>
      </ResponsiveSheet>
      {editing && sheet.data && <DetailsSheet sheet={sheet.data} userId={row.member.id} onClose={() => setEditing(false)} />}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fmt(t.deleteTitle, { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => remove.mutate()}>
              {dict.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The club's form text: season, fee, declaration, footer. */
function FormSettingsSheet({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const dict = useDictionary().ui;
  const t = dict.registration;
  const { api, queryClient } = useAppContext();
  const current = useQuery(registrationFormQuery(api, clubId));
  const [form, setForm] = useState<RegistrationForm | null>(null);
  const value = form ?? current.data ?? null;
  const save = useMutation({
    mutationFn: () => updateRegistrationForm(api, clubId, value!),
    onSuccess: (saved) => {
      queryClient.setQueryData(registrationKeys.form(clubId), saved);
      invalidateRegistrations(queryClient);
      toast.success(t.formSaved);
      onClose();
    },
  });
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.formSettings}
      footer={
        <Button type="submit" form="registration-form-settings" className="h-12 w-full text-base" disabled={!value || save.isPending}>
          {save.isPending && <Spinner />} {dict.common.save}
        </Button>
      }
    >
      {value ? (
        <form
          id="registration-form-settings"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="form-season">{t.season}</FieldLabel>
              <Input id="form-season" value={value.season} maxLength={20} required onChange={(e) => setForm({ ...value, season: e.target.value })} className="h-11" />
            </Field>
            <Field>
              <FieldLabel htmlFor="form-fee">{t.fee}</FieldLabel>
              <Input
                id="form-fee"
                inputMode="decimal"
                value={String(value.feeEuros)}
                onChange={(e) => setForm({ ...value, feeEuros: Number(e.target.value.replace(",", ".")) || 0 })}
                className="h-11"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="form-declaration">{t.declaration}</FieldLabel>
            <Textarea id="form-declaration" rows={8} value={value.declaration} maxLength={4000} onChange={(e) => setForm({ ...value, declaration: e.target.value })} />
            <FieldDescription>{t.declarationHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="form-footer">{t.footer}</FieldLabel>
            <Textarea id="form-footer" rows={3} value={value.footer} maxLength={600} onChange={(e) => setForm({ ...value, footer: e.target.value })} />
          </Field>
          {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
        </form>
      ) : (
        <Skeleton className="h-80" />
      )}
    </ResponsiveSheet>
  );
}

/** The club admin's season overview: who has handed in the signed form, and who's approved. */
export function ClubRegistrationsPage({ clubId }: { clubId: string }) {
  const dict = useDictionary().ui;
  const t = dict.registration;
  const { api } = useAppContext();
  const list = useQuery(clubRegistrationsQuery(api, clubId));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [settings, setSettings] = useState(false);

  const rows = (list.data?.rows ?? [])
    .filter((r) => filter === "all" || statusOf(r.registration) === filter)
    .filter((r) => normalizeSearch(`${r.member.name ?? ""} ${r.member.email ?? ""}`).includes(normalizeSearch(query)))
    .sort((a, b) => (a.member.name ?? "").localeCompare(b.member.name ?? ""));
  const count = (f: Filter) => (list.data?.rows ?? []).filter((r) => f === "all" || statusOf(r.registration) === f).length;
  const filters: [Filter, string][] = [
    ["all", t.filterAll],
    ["none", t.filterNone],
    ["pending", t.filterPending],
    ["received", t.filterReceived],
    ["approved", t.filterApproved],
  ];

  return (
    <Page>
      <PageHeader
        title={t.clubTitle}
        description={
          list.data && (
            <>
              {fmt(t.clubSubtitle, { season: list.data.season })} {fmt(t.progress, { done: count("approved"), total: count("all") })}
            </>
          )
        }
        actions={
          <Button variant="outline" onClick={() => setSettings(true)}>
            <Settings2 /> {t.formSettings}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={dict.members.search} type="search" className="h-10 sm:max-w-xs" />
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {filters.map(([f, label]) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" className="h-9 shrink-0" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label} <span className="tabular opacity-70">{count(f)}</span>
            </Button>
          ))}
        </div>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="divide-y px-0">
          {!list.data
            ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="m-3 h-12" />)
            : rows.map((row) => (
                <button key={row.member.id} type="button" onClick={() => setOpen(row)} className="tap-target flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 sm:px-6">
                  <PlayerAvatar id={row.member.id} name={row.member.name} photoUrl={row.member.photoUrl} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.member.name || row.member.email || dict.common.unknownPlayer}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.registration?.categories.map((c) => t.cat[c]).join(" · ") || row.member.email}
                    </div>
                  </div>
                  <StatusBadge registration={row.registration} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
        </CardContent>
      </Card>
      {open && list.data && (
        <MemberSheet key={open.member.id} row={open} clubId={clubId} storageConfigured={list.data.storageConfigured} onClose={() => setOpen(null)} />
      )}
      {settings && <FormSettingsSheet clubId={clubId} onClose={() => setSettings(false)} />}
    </Page>
  );
}
