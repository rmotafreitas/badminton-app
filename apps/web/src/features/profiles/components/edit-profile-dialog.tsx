import type { Profile } from "@bb/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { CoverAndPhotoField } from "@/shared/components/image-field";
import { initials } from "@/shared/components/player-avatar";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Spinner } from "@/shared/ui/spinner";
import { Textarea } from "@/shared/ui/textarea";
import { invalidateAfterProfile, updateMyProfile } from "@/features/profiles/api";

export function EditProfileDialog({ profile, open, onOpenChange }: { profile: Profile; open: boolean; onOpenChange: (open: boolean) => void }) {
  const dict = useDictionary().ui;
  const t = dict.profile;
  const { queryClient } = useAppContext();
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [birthday, setBirthday] = useState(profile.birthday ?? "");
  const [sex, setSex] = useState(profile.sex ?? "");
  const [photo, setPhoto] = useState<File | null | undefined>();
  const [banner, setBanner] = useState<File | null | undefined>();
  const save = useMutation({
    mutationFn: () => updateMyProfile({ name: name.trim(), bio, birthday, sex, photo, banner }),
    onSuccess: async (saved) => {
      toast.success(t.saved);
      void invalidateAfterProfile(queryClient, saved);
      onOpenChange(false);
    },
  });
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t.editTitle}
      footer={
        <Button type="submit" form="profile-form" className="h-12 w-full text-base" disabled={save.isPending || !name.trim()}>
          {save.isPending && <Spinner />} {dict.common.save}
        </Button>
      }
    >
      <form
        id="profile-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <CoverAndPhotoField
          cover={{ label: t.banner, current: profile.bannerUrl, value: banner, onChange: setBanner }}
          photo={{ label: t.photo, current: profile.photoUrl, value: photo, onChange: setPhoto }}
          removeLabel={dict.clubs.remove}
          fallback={initials(name || profile.name)}
        />
        <Field>
          <FieldLabel htmlFor="profile-name">{t.name}</FieldLabel>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="h-11" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field className="min-w-0">
            <FieldLabel htmlFor="profile-birthday">{t.birthday}</FieldLabel>
            <Input id="profile-birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="h-11" />
          </Field>
          <Field className="min-w-0">
            <FieldLabel>{t.sex}</FieldLabel>
            <Select value={sex || undefined} onValueChange={setSex}>
              <SelectTrigger className="w-full data-[size=default]:h-11">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(t.sexOptions).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="profile-bio">{t.bio}</FieldLabel>
          <Textarea id="profile-bio" rows={3} maxLength={500} placeholder={t.bioPlaceholder} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
      </form>
    </ResponsiveSheet>
  );
}
