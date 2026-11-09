import type { RegistrationCategory, RegistrationSheet } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Download, FileSignature, Pencil, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { isApiError } from "@/app/api";
import { Page, PageHeader } from "@/shared/components/page-header";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { formatDate } from "@/shared/lib/format";
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
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { eraseMyDetails, invalidateRegistrations, myRegistrationQuery, prepareRegistration, registrationKeys } from "./api";
import { DetailsSheet, PERSON_KEYS } from "./details-sheet";
import { buildFormPdf, fileName, saveOrShare } from "./download";

export const CATEGORIES: RegistrationCategory[] = ["ATLETA", "FORMACAO", "PRATICANTE", "SOCIO"];

/** Tick boxes of the form, as big chips. */
export function CategoryChips({ value, onChange, disabled }: { value: RegistrationCategory[]; onChange: (v: RegistrationCategory[]) => void; disabled?: boolean }) {
  const t = useDictionary().ui.registration;
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])}
            className={cn(
              "tap-target h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {t.cat[c]}
          </button>
        );
      })}
    </div>
  );
}

export const missingCount = (sheet: RegistrationSheet) => PERSON_KEYS.filter((k) => !sheet.person[k]).length;

/**
 * Prints the form: records this season's registration (so the club sees it's coming), then draws the PDF in the
 * browser and hands it to the share sheet / downloads. `userId` set = a club admin printing for a member.
 */
export function useDownloadForm(sheet: RegistrationSheet | undefined, userId?: string) {
  const { api, queryClient } = useAppContext();
  const t = useDictionary().ui.registration;
  return useMutation({
    mutationFn: async (categories: RegistrationCategory[]) => {
      if (!sheet) return;
      const registration = await prepareRegistration(api, userId, categories);
      queryClient.setQueryData(userId ? registrationKeys.member(userId) : registrationKeys.me(), { ...sheet, registration });
      invalidateRegistrations(queryClient);
      await saveOrShare(await buildFormPdf(sheet, categories), fileName(sheet));
    },
    onSuccess: () => toast.success(t.downloaded),
    onError: (e) => toast.error(e.message),
  });
}

function StatusCard({ sheet }: { sheet: RegistrationSheet }) {
  const t = useDictionary().ui.registration;
  const { lang } = useLanguage();
  const r = sheet.registration;
  const [Icon, text, tone] = !r
    ? [FileSignature, t.statusNone, "text-muted-foreground"]
    : r.status === "approved"
      ? [ShieldCheck, fmt(t.statusApproved, { date: formatDate(r.approvedAt as string, lang) }), "text-primary"]
      : r.status === "received"
        ? [CheckCircle2, t.statusReceived, "text-primary"]
        : [Clock3, t.statusPending, "text-amber-600 dark:text-amber-400"];
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3">
        <Icon className={cn("size-6 shrink-0", tone)} />
        <span className="font-medium">{text}</span>
      </CardContent>
    </Card>
  );
}

export function RegistrationView({ sheet, userId }: { sheet: RegistrationSheet; userId?: string }) {
  const dict = useDictionary().ui;
  const t = dict.registration;
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<RegistrationCategory[]>([...(sheet.registration?.categories ?? [])]);
  const download = useDownloadForm(sheet, userId);
  const approved = sheet.registration?.status === "approved";
  const missing = missingCount(sheet);
  return (
    <div className="space-y-4">
      <StatusCard sheet={sheet} />
      <Card>
        <CardHeader>
          <CardTitle>{t.categories}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CategoryChips value={approved ? [...(sheet.registration?.categories ?? [])] : categories} onChange={setCategories} disabled={approved} />
          <Button className="h-12 w-full text-base sm:w-auto" disabled={download.isPending || (!approved && categories.length === 0)} onClick={() => download.mutate(approved ? [...(sheet.registration?.categories ?? [])] : categories)}>
            {download.isPending ? <Spinner /> : <Download />} {download.isPending ? t.generating : t.download}
          </Button>
          {!approved && categories.length === 0 && <p className="text-sm text-muted-foreground">{t.categoryNeeded}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t.details}</CardTitle>
            <CardDescription>{t.detailsHint}</CardDescription>
          </div>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> {t.editDetails}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {PERSON_KEYS.map((k) => (
              <div key={k} className="flex justify-between gap-3 border-b py-1.5">
                <dt className="text-muted-foreground">{t[k]}</dt>
                <dd className="truncate text-right">{sheet.person[k] ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <p className={cn("text-sm", missing ? "text-muted-foreground" : "text-primary")}>{missing ? fmt(t.missing, { count: missing }) : t.complete}</p>
        </CardContent>
      </Card>
      {editing && <DetailsSheet sheet={sheet} userId={userId} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** The member's own registration: their details, the boxes, and the form to print. */
export function RegistrationPage() {
  const dict = useDictionary().ui;
  const t = dict.registration;
  const { api, queryClient } = useAppContext();
  const sheet = useQuery(myRegistrationQuery(api));
  const [erasing, setErasing] = useState(false);
  const erase = useMutation({
    mutationFn: () => eraseMyDetails(api),
    onSuccess: () => {
      toast.success(t.erased);
      void queryClient.invalidateQueries({ queryKey: registrationKeys.me() });
    },
    onError: (e) => toast.error(e.message),
  });

  if (sheet.error && isApiError(sheet.error, 422)) {
    return (
      <Page>
        <PageHeader title={t.title} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSignature />
            </EmptyMedia>
            <EmptyTitle>{t.title}</EmptyTitle>
            <EmptyDescription>{t.noClub}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    );
  }
  const data = sheet.data;
  return (
    <Page>
      <PageHeader title={t.title} description={data && fmt(t.subtitle, { season: data.form.season, club: data.club.name })} />
      <Card className="py-4">
        <CardContent>
          <p className="mb-2 text-sm font-medium">{t.stepsTitle}</p>
          <ol className="grid gap-2 text-sm sm:grid-cols-3">
            {[t.step1, t.step2, t.step3].map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      {data ? (
        <>
          <RegistrationView key={data.registration?.id ?? "none"} sheet={data} />
          {data.hasStoredDetails && (
            <Button variant="ghost" className="w-fit text-muted-foreground" onClick={() => setErasing(true)}>
              {t.erase}
            </Button>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      )}
      <AlertDialog open={erasing} onOpenChange={setErasing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.eraseTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.eraseBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => erase.mutate()}>
              {dict.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

