import type { Club, ClubDetail, Role } from "@bb/contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Api, sendForm, setImageField, unwrap } from "@/app/api";
import { staleTime } from "@/app/query-client";

export const clubKeys = {
  all: ["clubs"] as const,
  list: () => ["clubs", "list"] as const,
  detail: (id: string) => ["clubs", "detail", id] as const,
};

/** One club and its roster (members only). Persisted: the dashboard and pickers paint at once. */
export const clubQuery = (api: Api, clubId: string) =>
  queryOptions({
    queryKey: clubKeys.detail(clubId),
    queryFn: async () => unwrap(await api.clubs({ id: clubId }).get()) as ClubDetail,
    staleTime: staleTime.shared,
    meta: { persist: true },
  });

export const clubsQuery = (api: Api) =>
  queryOptions({ queryKey: clubKeys.list(), queryFn: async () => unwrap(await api.clubs.get()) as Club[] });

export interface ClubFormValues {
  name?: string;
  location?: string;
  /** `null` removes the image. */
  picture?: File | null;
  banner?: File | null;
}

const toForm = (values: ClubFormValues) => {
  const form = new FormData();
  if (values.name !== undefined) form.set("name", values.name);
  if (values.location !== undefined) form.set("location", values.location);
  setImageField(form, "picture", values.picture);
  setImageField(form, "banner", values.banner);
  return form;
};

export const createClub = (values: ClubFormValues & { name: string }) => sendForm<Club>("POST", "/api/clubs", toForm(values));
export const updateClub = (id: string, values: ClubFormValues) => sendForm<Club>("PATCH", `/api/clubs/${id}`, toForm(values));
export const deleteClub = async (api: Api, id: string) => unwrap(await api.clubs({ id }).delete());
export const assignUser = async (api: Api, userId: string, clubId: string | null) =>
  unwrap(await api.clubs.assignments.post({ userId, clubId }));

/** Club changes show up in the roster, the admin lists and the session (club name/id). */
export const invalidateClubs = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: clubKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["users"] }),
    queryClient.invalidateQueries({ queryKey: ["session"] }),
  ]);

// ── Membership (club admins for their club, system admins for any) ──────────

export type AddMemberInput = { userId: string } | { email?: string; phone?: string; name?: string; roles?: Role[] };

export const addMember = async (api: Api, clubId: string, input: AddMemberInput) => unwrap(await api.clubs({ id: clubId }).members.post(input));

export const setMemberRoles = async (api: Api, clubId: string, userId: string, roles: Role[]) =>
  unwrap(await api.clubs({ id: clubId }).members({ userId }).roles.put({ roles }));

export const removeMember = async (api: Api, clubId: string, userId: string) => unwrap(await api.clubs({ id: clubId }).members({ userId }).delete());
