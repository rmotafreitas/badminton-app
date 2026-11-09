import { canManageClub } from "@/clubs/club";
import { type Actor, isSameClub, isSystemAdmin } from "@/shared/actor";

/**
 * A club's season registration ("Ficha de Inscrição"): the member prints a pre-filled form, signs it and hands it to
 * the club, whose admin records the signed copy and approves it.
 */

/** The boxes at the top of the form. A member may tick more than one (an athlete is usually a member too). */
export const REGISTRATION_CATEGORIES = ["ATLETA", "FORMACAO", "PRATICANTE", "SOCIO"] as const;
export type RegistrationCategory = (typeof REGISTRATION_CATEGORIES)[number];

/** Identification facts a club needs that the profile doesn't hold. Any of them may be missing. */
export interface PersonalDetails {
  readonly fullName: string | null;
  readonly sex: "M" | "F" | null;
  /** YYYY-MM-DD. */
  readonly birthday: string | null;
  readonly nationality: string | null;
  readonly address: string | null;
  readonly locality: string | null;
  /** "Concelho". */
  readonly municipality: string | null;
  /** NNNN-NNN. */
  readonly postalCode: string | null;
  /** BI / Cartão de Cidadão number. */
  readonly idNumber: string | null;
  /** YYYY-MM-DD. */
  readonly idValidUntil: string | null;
  readonly nif: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly profession: string | null;
}

/** What the member keeps on file: their own details, an IBAN/NIB, and a legal guardian's details if under 18. */
export interface MemberDetails {
  readonly userId: string;
  readonly person: PersonalDetails;
  readonly nib: string | null;
  readonly guardian: PersonalDetails | null;
  readonly updatedAt: Date;
}

export const EMPTY_PERSON: PersonalDetails = {
  fullName: null,
  sex: null,
  birthday: null,
  nationality: null,
  address: null,
  locality: null,
  municipality: null,
  postalCode: null,
  idNumber: null,
  idValidUntil: null,
  nif: null,
  phone: null,
  email: null,
  profession: null,
};

/** The club-specific text of the form. `{fee}` and `{season}` are replaced when it's printed. */
export interface RegistrationForm {
  /** e.g. "2024" or "2024/2025". */
  readonly season: string;
  /** Annual membership fee in euros. */
  readonly feeEuros: number;
  readonly declaration: string;
  /** Centered lines at the bottom: club NIF, contacts, payment address. */
  readonly footer: string;
}

/** CFBG's 2024 form, the default for every club until its admin edits it. */
export const DEFAULT_REGISTRATION_FORM: RegistrationForm = {
  season: "2024",
  feeEuros: 15,
  declaration:
    "Declaro que tomei conhecimento do valor da quota anual de sócio no valor de {fee}. Em caso de menor, o seu " +
    "representante legal também terá que ser sócio. Tomei conhecimento do valor da respetiva mensalidade estipulada no " +
    "regulamento do clube para a época {season}. Tomei conhecimento e aceito as normas estipuladas no regulamento do " +
    "clube, e nos respetivos códigos de conduta para atletas e pais. Em caso de menores de 18 anos, como REPRESENTANTE " +
    "LEGAL, autorizo a captação de imagens do meu filho nos treinos, torneios ou outras atividades em que o mesmo " +
    "participe no âmbito da prática do Badminton. Mais autorizo que tais imagens sejam divulgadas pelo {club}.",
  footer:
    "NIF: 510376690\nContactos: 962663825 (Miguel Rocha)\nclubefasbadgaia@gmail.com    pagamentos: pagamentoscfbg@gmail.com",
};

export const formatEuros = (value: number) => `${value.toFixed(2).replace(".", ",")}€`;

/** The declaration with its placeholders filled in. */
export const declarationText = (form: RegistrationForm, clubName: string) =>
  form.declaration.replaceAll("{fee}", formatEuros(form.feeEuros)).replaceAll("{season}", form.season).replaceAll("{club}", clubName);

export type RegistrationStatus = "pending" | "received" | "approved";

export interface Registration {
  readonly id: string;
  readonly userId: string;
  readonly clubId: string;
  readonly season: string;
  readonly categories: readonly RegistrationCategory[];
  /** The club has the signed paper (with or without an uploaded scan). */
  readonly signedReceived: boolean;
  /** Object-storage key of the uploaded scan, when there is one. */
  readonly signedFileKey: string | null;
  readonly signedFileType: string | null;
  readonly approvedAt: Date | null;
  readonly approvedById: string | null;
  /** "Obs" in the club's box. */
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const registrationStatus = (r: Pick<Registration, "approvedAt" | "signedReceived">): RegistrationStatus =>
  r.approvedAt ? "approved" : r.signedReceived ? "received" : "pending";

/** Signed scans: a PDF or a phone photo of the paper. */
export const SIGNED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const SIGNED_FILE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * ID numbers, NIF, address: the person, their club's admins and system admins. Not coaches, not other players.
 */
export const canSeePersonalDetails = (actor: Actor, target: { userId: string; clubId: string | null }): boolean =>
  actor.userId === target.userId || isSystemAdmin(actor) || (actor.roles.includes("CLUB_ADMIN") && isSameClub(actor, target.clubId));

/** Recording signed forms and approving them: the club's admins and system admins. */
export const canManageRegistrations = canManageClub;

/** Age on a given day, from a YYYY-MM-DD birthday. */
export function ageOn(birthday: string, day: Date): number {
  const [y, m, d] = birthday.split("-").map(Number) as [number, number, number];
  let age = day.getUTCFullYear() - y;
  if (day.getUTCMonth() + 1 < m || (day.getUTCMonth() + 1 === m && day.getUTCDate() < d)) age--;
  return age;
}
