import type { ClubDetail, ClubMember, Role } from "@bb/contracts";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal, ShieldCheck, UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { addMember, invalidateClubs, removeMember, setMemberRoles } from "@/features/clubs";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { RolesInput } from "@/shared/components/roles-input";
import { hasRole, useSessionUser } from "@/features/auth";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";

/** Add someone by email or phone. An unknown address becomes an invite: they join on their first sign-in. */
export function AddMemberSheet({ club, open, onOpenChange }: { club: ClubDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const dict = useDictionary().ui;
  const viewer = useSessionUser();
  const { api, queryClient } = useAppContext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<Role[]>(["PLAYER"]);
  const add = useMutation({
    mutationFn: () =>
      addMember(api, club.id, {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        roles,
      }),
    onSuccess: (user) => {
      toast.success(fmt(dict.members.added, { name: user.name || user.email || user.phone || "" }));
      void invalidateClubs(queryClient);
      onOpenChange(false);
    },
  });
  const missingContact = !email.trim() && !phone.trim();
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={fmt(dict.members.addTitle, { club: club.name })}
      description={dict.members.addHint}
      footer={
        <Button type="submit" form="add-member-form" className="h-12 w-full text-base" disabled={add.isPending || missingContact}>
          {add.isPending && <Spinner />} {dict.members.add}
        </Button>
      }
    >
      <form
        id="add-member-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missingContact) add.mutate();
        }}
      >
        <Field>
          <FieldLabel htmlFor="member-email">{dict.members.email}</FieldLabel>
          <Input id="member-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </Field>
        <Field>
          <FieldLabel htmlFor="member-phone">{dict.members.phone}</FieldLabel>
          <Input id="member-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" />
          {missingContact && <FieldDescription>{dict.members.contactNeeded}</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="member-name">
            {dict.members.name} <span className="font-normal text-muted-foreground">({dict.common.optional})</span>
          </FieldLabel>
          <Input id="member-name" autoComplete="off" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-11" />
        </Field>
        <Field>
          <FieldLabel>{dict.members.roles}</FieldLabel>
          <RolesInput value={roles} onChange={setRoles} canGrantSystemAdmin={hasRole(viewer, "SYSTEM_ADMIN")} />
        </Field>
        {add.error && <p className="text-sm text-destructive">{add.error.message}</p>}
      </form>
    </ResponsiveSheet>
  );
}

function RolesSheet({ club, member, onClose }: { club: ClubDetail; member: ClubMember; onClose: () => void }) {
  const dict = useDictionary().ui;
  const viewer = useSessionUser();
  const { api, queryClient } = useAppContext();
  const [roles, setRoles] = useState<Role[]>([...member.roles]);
  const save = useMutation({
    mutationFn: () => setMemberRoles(api, club.id, member.id, roles),
    onSuccess: () => {
      toast.success(dict.members.rolesSaved);
      void invalidateClubs(queryClient);
      onClose();
    },
  });
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={fmt(dict.members.rolesTitle, { name: member.name || member.email || "" })}
      description={dict.members.rolesHint}
      footer={
        <Button className="h-12 w-full text-base" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Spinner />} {dict.common.save}
        </Button>
      }
    >
      <div className="space-y-3">
        <RolesInput value={roles} onChange={setRoles} canGrantSystemAdmin={hasRole(viewer, "SYSTEM_ADMIN")} />
        {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
      </div>
    </ResponsiveSheet>
  );
}

/** The ⋯ menu on a roster row: change roles, remove from the club. */
export function MemberActions({ club, member }: { club: ClubDetail; member: ClubMember }) {
  const dict = useDictionary().ui;
  const { api, queryClient } = useAppContext();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const name = member.name || member.email || dict.common.unknownPlayer;
  const remove = useMutation({
    mutationFn: () => removeMember(api, club.id, member.id),
    onSuccess: () => {
      toast.success(fmt(dict.members.removed, { name }));
      void invalidateClubs(queryClient);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10" aria-label={dict.members.actions}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="py-3" onSelect={() => setEditing(true)}>
            <ShieldCheck /> {dict.members.editRoles}
          </DropdownMenuItem>
          <DropdownMenuItem className="py-3 text-destructive focus:text-destructive" onSelect={() => setRemoving(true)}>
            <UserMinus /> {dict.members.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <RolesSheet club={club} member={member} onClose={() => setEditing(false)} />}
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fmt(dict.members.removeTitle, { name, club: club.name })}</AlertDialogTitle>
            <AlertDialogDescription>{dict.members.removeBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => remove.mutate()}>
              {dict.members.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
