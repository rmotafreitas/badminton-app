import type { ClubRegistrationRow, RegistrationSheet as SheetEntity } from "@bb/application";
import type { ClubRegistrationList, Registration, RegistrationSheet } from "@bb/contracts";
import { type Registration as RegistrationEntity, registrationStatus } from "@bb/domain";
import { clubImageUrl, profileImageUrl } from "@/http";

export const presentRegistration = (r: RegistrationEntity): Registration => ({
  id: r.id,
  userId: r.userId,
  clubId: r.clubId,
  season: r.season,
  categories: [...r.categories],
  status: registrationStatus(r),
  signedReceived: r.signedReceived,
  // The storage key stays on the server: the scan is only reachable through a short-lived link.
  hasSignedFile: !!r.signedFileKey,
  signedFileType: r.signedFileType,
  approvedAt: r.approvedAt?.toISOString() ?? null,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const presentRegistrationSheet = (s: SheetEntity): RegistrationSheet => ({
  member: { id: s.user.id, name: s.user.name, photoUrl: profileImageUrl(s.user.id, "photo", s.user.photoVersion) },
  club: { id: s.club.id, name: s.club.name, pictureUrl: clubImageUrl(s.club.id, "picture", s.club.pictureVersion) },
  form: { ...s.form },
  person: { ...s.person },
  nib: s.nib,
  guardian: s.guardian ? { ...s.guardian } : null,
  hasStoredDetails: s.hasStoredDetails,
  registration: s.registration ? presentRegistration(s.registration) : null,
  canManage: s.canManage,
  storageConfigured: s.storageConfigured,
});

export const presentClubRegistrations = (list: { season: string; storageConfigured: boolean; rows: readonly ClubRegistrationRow[] }): ClubRegistrationList => ({
  season: list.season,
  storageConfigured: list.storageConfigured,
  rows: list.rows.map((row) => ({
    member: { id: row.member.id, name: row.member.name, email: row.member.email, photoUrl: profileImageUrl(row.member.id, "photo", row.member.photoVersion) },
    registration: row.registration ? presentRegistration(row.registration) : null,
  })),
});
