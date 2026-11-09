import { z } from "zod";
import { IdSchema, ImageUrlSchema, IsoDateTime } from "./common";

/** Season registration ("Ficha de Inscrição"): private details, the club's form text, and the registration itself. */

export const RegistrationCategorySchema = z.enum(["ATLETA", "FORMACAO", "PRATICANTE", "SOCIO"]);
export type RegistrationCategory = z.infer<typeof RegistrationCategorySchema>;

const optionalText = (max: number) => z.string().max(max).nullable();

export const PersonalDetailsSchema = z.object({
  fullName: optionalText(120),
  sex: z.enum(["M", "F"]).nullable(),
  /** YYYY-MM-DD. */
  birthday: optionalText(10),
  nationality: optionalText(60),
  address: optionalText(160),
  locality: optionalText(80),
  municipality: optionalText(80),
  /** 0000-000. */
  postalCode: optionalText(8),
  idNumber: optionalText(30),
  /** YYYY-MM-DD. */
  idValidUntil: optionalText(10),
  nif: optionalText(12),
  phone: optionalText(30),
  email: optionalText(200),
  profession: optionalText(80),
});
export type PersonalDetails = z.infer<typeof PersonalDetailsSchema>;

export const RegistrationFormSchema = z.object({
  season: z.string().min(1).max(20),
  feeEuros: z.number().min(0).max(10_000),
  /** `{fee}`, `{season}` and `{club}` are filled in when printed. */
  declaration: z.string().max(4000),
  /** Centered lines at the bottom of the form. */
  footer: z.string().max(600),
});
export type RegistrationForm = z.infer<typeof RegistrationFormSchema>;

export const RegistrationSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  clubId: IdSchema,
  season: z.string(),
  categories: z.array(RegistrationCategorySchema),
  status: z.enum(["pending", "received", "approved"]),
  signedReceived: z.boolean(),
  hasSignedFile: z.boolean(),
  signedFileType: z.string().nullable(),
  approvedAt: IsoDateTime.nullable(),
  notes: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Registration = z.infer<typeof RegistrationSchema>;

/** Everything needed to draw one member's form. */
export const RegistrationSheetSchema = z.object({
  member: z.object({ id: IdSchema, name: z.string().nullable(), photoUrl: ImageUrlSchema }),
  club: z.object({ id: IdSchema, name: z.string(), pictureUrl: ImageUrlSchema }),
  form: RegistrationFormSchema,
  /** Stored details; gaps are filled from the profile (name, sex, birthday, phone, email). */
  person: PersonalDetailsSchema,
  nib: z.string().nullable(),
  guardian: PersonalDetailsSchema.nullable(),
  hasStoredDetails: z.boolean(),
  registration: RegistrationSchema.nullable(),
  canManage: z.boolean(),
  storageConfigured: z.boolean(),
});
export type RegistrationSheet = z.infer<typeof RegistrationSheetSchema>;

export const SaveDetailsBodySchema = z.object({
  person: PersonalDetailsSchema.partial(),
  nib: z.string().max(40).nullable().optional(),
  guardian: PersonalDetailsSchema.partial().nullable().optional(),
});
export type SaveDetailsBody = z.infer<typeof SaveDetailsBodySchema>;

export const PrepareRegistrationBodySchema = z.object({ categories: z.array(RegistrationCategorySchema).max(4) });

export const ClubRegistrationListSchema = z.object({
  season: z.string(),
  storageConfigured: z.boolean(),
  rows: z.array(
    z.object({
      member: z.object({ id: IdSchema, name: z.string().nullable(), email: z.string().nullable(), photoUrl: ImageUrlSchema }),
      registration: RegistrationSchema.nullable(),
    }),
  ),
});
export type ClubRegistrationList = z.infer<typeof ClubRegistrationListSchema>;

export const UpdateRegistrationBodySchema = z.object({
  signedReceived: z.boolean().optional(),
  approved: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const SignedUploadBodySchema = z.object({ contentType: z.string().max(60), bytes: z.number().int().positive() });
export const SignedUploadSchema = z.object({ key: z.string(), url: z.string(), contentType: z.string() });
export const CompleteSignedUploadBodySchema = z.object({ key: z.string().max(300), contentType: z.string().max(60) });
export const SignedFileUrlSchema = z.object({ url: z.string(), contentType: z.string().nullable() });
export const UserParamsSchema = z.object({ userId: IdSchema });
