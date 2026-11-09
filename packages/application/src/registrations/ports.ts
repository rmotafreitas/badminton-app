import type { MemberDetails, PersonalDetails, Registration, RegistrationCategory, RegistrationForm } from "@bb/domain";

export interface MemberDetailsRepository {
  find(userId: string): Promise<MemberDetails | null>;
  save(userId: string, details: { person: PersonalDetails; nib: string | null; guardian: PersonalDetails | null }): Promise<MemberDetails>;
  /** The person's right to erasure: their stored details are deleted. */
  erase(userId: string): Promise<void>;
}

export interface RegistrationFormRepository {
  /** Null = the club never edited it (the default form applies). */
  find(clubId: string): Promise<RegistrationForm | null>;
  save(clubId: string, form: RegistrationForm): Promise<void>;
}

export interface RegistrationPatch {
  readonly categories?: readonly RegistrationCategory[];
  readonly signedReceived?: boolean;
  readonly signedFileKey?: string | null;
  readonly signedFileType?: string | null;
  readonly approvedAt?: Date | null;
  readonly approvedById?: string | null;
  readonly notes?: string | null;
}

export interface RegistrationRepository {
  findById(id: string): Promise<Registration | null>;
  find(userId: string, clubId: string, season: string): Promise<Registration | null>;
  /** Every registration of the club for a season. */
  listByClub(clubId: string, season: string): Promise<Registration[]>;
  listByUser(userId: string): Promise<Registration[]>;
  create(input: { userId: string; clubId: string; season: string; categories: readonly RegistrationCategory[] }): Promise<Registration>;
  update(id: string, patch: RegistrationPatch): Promise<Registration>;
  delete(id: string): Promise<void>;
}
