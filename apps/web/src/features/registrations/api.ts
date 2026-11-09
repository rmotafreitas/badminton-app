import type { ClubRegistrationList, Registration, RegistrationCategory, RegistrationForm, RegistrationSheet, SaveDetailsBody } from "@bb/contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Api, ApiError, NetworkError, unwrap } from "@/app/api";

/**
 * Registration data holds ID and tax numbers: these queries are never persisted to the device's offline cache
 * (no `meta.persist`), only kept in memory while the app is open.
 */
export const registrationKeys = {
  all: ["registrations"] as const,
  me: () => ["registrations", "me"] as const,
  member: (userId: string) => ["registrations", "member", userId] as const,
  club: (clubId: string) => ["registrations", "club", clubId] as const,
  form: (clubId: string) => ["registrations", "form", clubId] as const,
};

export const myRegistrationQuery = (api: Api) =>
  queryOptions({ queryKey: registrationKeys.me(), queryFn: async () => unwrap(await api.registrations.me.get()) as RegistrationSheet });

export const memberRegistrationQuery = (api: Api, userId: string) =>
  queryOptions({
    queryKey: registrationKeys.member(userId),
    queryFn: async () => unwrap(await api.registrations.members({ userId }).get()) as RegistrationSheet,
  });

export const clubRegistrationsQuery = (api: Api, clubId: string) =>
  queryOptions({
    queryKey: registrationKeys.club(clubId),
    queryFn: async () => unwrap(await api.registrations.clubs({ id: clubId }).get()) as ClubRegistrationList,
  });

export const registrationFormQuery = (api: Api, clubId: string) =>
  queryOptions({
    queryKey: registrationKeys.form(clubId),
    queryFn: async () => unwrap(await api.registrations.clubs({ id: clubId }).form.get()) as RegistrationForm,
  });

/** `userId` undefined = my own. */
export const saveDetails = async (api: Api, userId: string | undefined, body: SaveDetailsBody) =>
  (userId ? unwrap(await api.registrations.members({ userId }).details.put(body)) : unwrap(await api.registrations.me.details.put(body))) as RegistrationSheet;

export const eraseMyDetails = async (api: Api) => unwrap(await api.registrations.me.details.delete());

export const prepareRegistration = async (api: Api, userId: string | undefined, categories: RegistrationCategory[]) =>
  (userId
    ? unwrap(await api.registrations.members({ userId }).prepare.post({ categories }))
    : unwrap(await api.registrations.me.prepare.post({ categories }))) as Registration;

export const updateRegistration = async (api: Api, id: string, changes: { signedReceived?: boolean; approved?: boolean; notes?: string | null }) =>
  unwrap(await api.registrations({ id }).patch(changes)) as Registration;

export const deleteRegistration = async (api: Api, id: string) => unwrap(await api.registrations({ id }).delete());

export const updateRegistrationForm = async (api: Api, clubId: string, form: RegistrationForm) =>
  unwrap(await api.registrations.clubs({ id: clubId }).form.put(form)) as RegistrationForm;

export const signedFileUrl = async (api: Api, id: string) => unwrap(await api.registrations({ id }).signed.get());

export const removeSignedFile = async (api: Api, id: string) => unwrap(await api.registrations({ id }).signed.delete()) as Registration;

/** Phones often say "" for HEIC photos; guess from the name so the server accepts it. */
const fileType = (file: File) =>
  file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.heic$/i.test(file.name) ? "image/heic" : /\.png$/i.test(file.name) ? "image/png" : "image/jpeg");

/** The scan goes straight from the browser to the bucket (presigned), then the API records it. */
export async function uploadSignedFile(api: Api, id: string, file: File): Promise<Registration> {
  const contentType = fileType(file);
  const target = unwrap(await api.registrations({ id }).signed.upload.post({ contentType, bytes: file.size }));
  let response: Response;
  try {
    response = await fetch(target.url, { method: "PUT", body: file, headers: { "content-type": contentType } });
  } catch (cause) {
    throw new NetworkError({ cause });
  }
  if (!response.ok) throw new ApiError(response.status, "upload_failed", "The upload failed. Try again.");
  return unwrap(await api.registrations({ id }).signed.complete.post({ key: target.key, contentType })) as Registration;
}

/** Club side changed: the club list, that member's sheet and my own sheet may all show it. Not awaited. */
export function invalidateRegistrations(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: registrationKeys.all });
}
