import type { Club } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { ImageField } from "@/shared/components/image-field";
import { Page, PageHeader } from "@/shared/components/page-header";
import { PlayerAvatar } from "@/shared/components/player-avatar";
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
import { Card, CardContent } from "@/shared/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { clubsQuery, createClub, deleteClub, invalidateClubs, updateClub } from "@/features/clubs/api";

function ClubDialog({ club, open, onOpenChange }: { club?: Club; open: boolean; onOpenChange: (open: boolean) => void }) {
  const dict = useDictionary().ui;
  const { queryClient } = useAppContext();
  const [name, setName] = useState(club?.name ?? "");
  const [location, setLocation] = useState(club?.location ?? "");
  const [picture, setPicture] = useState<File | null | undefined>();
  const [banner, setBanner] = useState<File | null | undefined>();
  const save = useMutation({
    mutationFn: () => {
      const values = { name: name.trim(), location: location.trim(), picture, banner };
      return club ? updateClub(club.id, values) : createClub(values);
    },
    onSuccess: async () => {
      toast.success(dict.clubs.saved);
      void invalidateClubs(queryClient);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{club ? dict.clubs.editTitle : dict.clubs.createTitle}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <ImageField label={dict.clubs.banner} aspect="banner" current={club?.bannerUrl ?? null} value={banner} onChange={setBanner} removeLabel={dict.clubs.remove} />
          <div className="flex gap-4">
            <ImageField label={dict.clubs.picture} current={club?.pictureUrl ?? null} value={picture} onChange={setPicture} removeLabel={dict.clubs.remove} />
            <div className="flex-1 space-y-4">
              <Field>
                <FieldLabel htmlFor="club-name">{dict.clubs.name}</FieldLabel>
                <Input id="club-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="club-location">{dict.clubs.location}</FieldLabel>
                <Input id="club-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
              </Field>
            </div>
          </div>
          {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner />} {dict.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClubsPage() {
  const dict = useDictionary().ui;
  const { api, queryClient } = useAppContext();
  const clubs = useQuery(clubsQuery(api));
  const [editing, setEditing] = useState<Club | "new" | null>(null);
  const [deleting, setDeleting] = useState<Club | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => deleteClub(api, id),
    onSuccess: async () => {
      toast.success(dict.clubs.deleted);
      void invalidateClubs(queryClient);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Page>
      <PageHeader
        title={dict.clubs.title}
        description={dict.clubs.subtitle}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> {dict.clubs.new}
          </Button>
        }
      />
      {clubs.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !clubs.data?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>{dict.clubs.empty}</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setEditing("new")}>
              <Plus /> {dict.clubs.new}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.data.map((club) => (
            <Card key={club.id} className="gap-0 overflow-hidden py-0">
              <div className="relative h-24 bg-gradient-to-br from-primary/70 to-primary">
                {club.bannerUrl && <img src={club.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />}
              </div>
              <CardContent className="flex items-end gap-3 pb-5">
                <PlayerAvatar id={club.id} name={club.name} photoUrl={club.pictureUrl} className="-mt-7 size-14 ring-4 ring-card" />
                <div className="min-w-0 flex-1 pt-3">
                  <div className="truncate font-semibold">{club.name}</div>
                  {club.location && (
                    <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {club.location}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={dict.common.edit} onClick={() => setEditing(club)}>
                    <Pencil />
                  </Button>
                  <Button size="icon" variant="ghost" className="hover:text-destructive" aria-label={dict.common.delete} onClick={() => setDeleting(club)}>
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && <ClubDialog key={editing === "new" ? "new" : editing.id} club={editing === "new" ? undefined : editing} open onOpenChange={(o) => !o && setEditing(null)} />}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fmt(dict.clubs.deleteTitle, { name: deleting?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{dict.clubs.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => deleting && remove.mutate(deleting.id)}>
              {dict.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
