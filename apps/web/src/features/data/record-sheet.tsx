import type { DataRecord, DataRow, DataTable } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { useSessionUser } from "@/features/auth";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
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
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { createRecord, dataKeys, dataRecordQuery, dataRelatedQuery, deleteRecord, invalidateAfterDataWrite, updateRecord } from "./api";
import { FieldValue, type Refs, useLabel, useRowTitle } from "./fields";
import { blankValues, type FormImages, type FormValues, RecordFields, rowValues } from "./record-form";

/** Only what changed is sent: untouched fields stay as the server has them. */
function changedValues(before: FormValues, after: FormValues): FormValues {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(before[k] ?? null)));
}

const imagesToSend = (images: FormImages) => Object.fromEntries(Object.entries(images).filter(([, v]) => v !== undefined));

const linkRow = "tap-target flex items-center justify-between gap-3 px-3 py-3 text-sm hover:bg-muted/60";

/** Where a row is pointed at from: a count per related table, each a link to that table filtered to this row. */
function RelatedLinks({ table, rowId, clubId, onNavigate }: { table: DataTable; rowId: string; clubId: string | null; onNavigate: () => void }) {
  const dict = useDictionary().ui;
  const label = useLabel();
  const { api } = useAppContext();
  const viewer = useSessionUser();
  const counts = useQuery({ ...dataRelatedQuery(api, table.key, rowId), enabled: table.related.length > 0 });
  // A member's registration lives on the club's Registrations page, for the admins of that club.
  const registration = table.key === "users" && viewer.roles.includes("CLUB_ADMIN") && !!clubId && clubId === viewer.clubId;
  if (!table.related.length && !registration) return null;
  return (
    <section className="mt-4">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{dict.data.related}</h3>
      <div className="divide-y rounded-lg border">
        {table.related.map((r) => {
          const count = counts.data?.find((c) => c.table === r.table)?.count;
          return (
            <Link key={r.table} to="/data/$table" params={{ table: r.table }} search={{ of: `${table.key}:${rowId}` }} className={linkRow} onClick={onNavigate}>
              <span>{label(r.label)}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                {count === undefined ? <Skeleton className="h-4 w-6" /> : <span className="tabular">{count.toLocaleString(label.locale)}</span>}
                <ChevronRight className="size-4" />
              </span>
            </Link>
          );
        })}
        {registration && (
          <Link to="/club-registrations" search={{ member: rowId }} className={linkRow} onClick={onNavigate}>
            <span>{dict.registration.clubTitle}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * One row: its details, and editing in place. Opens from the list with the list's copy of the row (instant), then
 * revalidates it. `row = null` creates a new one.
 */
export function RecordSheet({
  table,
  row: listRow,
  refs: listRefs,
  open,
  onOpenChange,
}: {
  table: DataTable;
  row: DataRow | null;
  refs: Refs;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dict = useDictionary().ui;
  const label = useLabel();
  const rowTitle = useRowTitle();
  const { api, queryClient } = useAppContext();
  const creating = listRow === null;
  const record = useQuery({
    ...dataRecordQuery(api, table.key, listRow?.id ?? ""),
    enabled: open && !creating,
    initialData: listRow ? { table, row: listRow, refs: listRefs } : undefined,
    initialDataUpdatedAt: 0,
  });
  const live = record.data ?? null;
  const row = live?.row ?? listRow;
  const refs = { ...listRefs, ...live?.refs } as Refs;
  const current = live?.table ?? table;

  const formFields = (mode: "create" | "edit") => {
    const keys = mode === "create" ? current.createFields : current.editFields;
    return current.fields.filter((f) => keys.includes(f.key));
  };
  const [editing, setEditing] = useState(creating);
  const [values, setValues] = useState<FormValues>(() => (creating ? blankValues(formFields("create")) : {}));
  const [images, setImages] = useState<FormImages>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    if (!row) return;
    setValues(rowValues(formFields("edit"), row));
    setImages({});
    setEditing(true);
  };

  const remember = (saved: DataRecord) => {
    queryClient.setQueryData(dataKeys.record(table.key, saved.row.id), saved);
    invalidateAfterDataWrite(queryClient, table.key);
  };

  const save = useMutation({
    mutationFn: () =>
      creating
        ? createRecord(table.key, { values, images: imagesToSend(images) })
        : updateRecord(table.key, row!.id, { values: changedValues(rowValues(formFields("edit"), row!), values), images: imagesToSend(images) }),
    onSuccess: (saved) => {
      remember(saved);
      toast.success(creating ? dict.data.created : dict.data.saved);
      if (creating) onOpenChange(false);
      else setEditing(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteRecord(api, table.key, row!.id),
    onSuccess: () => {
      invalidateAfterDataWrite(queryClient, table.key);
      toast.success(dict.data.deleted);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const title = creating ? fmt(dict.data.newTitle, { table: label(table.label) }) : row ? rowTitle(current, row, refs) : "";
  const deleteText = current.deleteLabel ? label(current.deleteLabel) : dict.common.delete;
  const formId = `data-form-${table.key}`;

  // Distinct keys: without them React reuses the Edit button's DOM node as Save, flips it to type="submit" inside the
  // click, and the browser then submits the form with that same click.
  const footer = editing ? (
    <div key="editing" className="flex w-full gap-2">
      {!creating && (
        <Button key="cancel" type="button" variant="outline" className="h-12 flex-1 text-base" onClick={() => setEditing(false)}>
          {dict.common.cancel}
        </Button>
      )}
      <Button key="save" type="submit" form={formId} className="h-12 flex-1 text-base" disabled={save.isPending}>
        {save.isPending && <Spinner />} {dict.common.save}
      </Button>
    </div>
  ) : current.canUpdate || current.canDelete ? (
    <div key="viewing" className="flex w-full gap-2">
      {current.canDelete && (
        <Button key="delete" type="button" variant="outline" className="h-12 flex-1 text-base text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 /> {deleteText}
        </Button>
      )}
      {current.canUpdate && current.editFields.length > 0 && (
        <Button key="edit" type="button" className="h-12 flex-1 text-base" onClick={startEdit}>
          <Pencil /> {dict.common.edit}
        </Button>
      )}
    </div>
  ) : undefined;

  return (
    <>
      <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={title} description={editing || current.canUpdate || current.canDelete ? undefined : dict.data.readOnly} footer={footer}>
        {editing ? (
          <div className="space-y-4">
            <RecordFields
              table={current}
              fields={formFields(creating ? "create" : "edit")}
              values={values}
              images={images}
              current={row}
              refs={refs}
              onValues={setValues}
              onImages={setImages}
              formId={formId}
              onSubmit={() => save.mutate()}
            />
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        ) : row ? (
          <>
            <dl className="divide-y">
              {current.fields.map((f) => (
                <div key={f.key} className="flex items-start justify-between gap-4 py-3">
                  <dt className="shrink-0 text-sm text-muted-foreground">{label(f.label)}</dt>
                  <dd className="min-w-0 text-right text-sm break-words">
                    <FieldValue field={f} row={row} refs={refs} title={title} className={f.type === "image" ? "size-12" : undefined} />
                  </dd>
                </div>
              ))}
            </dl>
            <RelatedLinks
              table={current}
              rowId={row.id}
              clubId={table.key === "users" ? ((row.values.clubId as string | null) ?? null) : null}
              onNavigate={() => onOpenChange(false)}
            />
          </>
        ) : null}
      </ResponsiveSheet>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{current.deleteLabel ? `${deleteText}: ${title}?` : dict.data.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{current.deleteHint ? label(current.deleteHint) : dict.data.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => remove.mutate()}>
              {remove.isPending && <Spinner />} {deleteText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
