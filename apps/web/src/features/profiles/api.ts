import type { Profile } from "@bb/contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Api, sendForm, setImageField, unwrap } from "@/app/api";
import { staleTime } from "@/app/query-client";

export const profileKeys = {
  all: ["profiles"] as const,
  detail: (userId: string) => ["profiles", userId] as const,
};

export const profileQuery = (api: Api, userId: string) =>
  queryOptions({
    queryKey: profileKeys.detail(userId),
    queryFn: async () => unwrap(await api.profiles({ userId }).get()) as Profile,
    staleTime: staleTime.own,
    meta: { persist: true },
  });

export interface ProfileFormValues {
  name?: string;
  birthday?: string;
  sex?: string;
  bio?: string;
  /** `null` removes the image. */
  photo?: File | null;
  banner?: File | null;
}

export function updateMyProfile(values: ProfileFormValues) {
  const form = new FormData();
  for (const key of ["name", "birthday", "sex", "bio"] as const) if (values[key] !== undefined) form.set(key, values[key] ?? "");
  setImageField(form, "photo", values.photo);
  setImageField(form, "banner", values.banner);
  return sendForm<Profile>("PATCH", "/api/profiles/me", form);
}

/** A name or photo appears in the header (session), rosters and every game card. */
export const invalidateAfterProfile = (queryClient: QueryClient, profile: Profile) => {
  queryClient.setQueryData(profileKeys.detail(profile.userId), profile);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["session"] }),
    queryClient.invalidateQueries({ queryKey: ["clubs", "detail"] }),
    queryClient.invalidateQueries({ queryKey: ["games"] }),
  ]);
};
