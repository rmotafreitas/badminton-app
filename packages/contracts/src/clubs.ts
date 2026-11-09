import { z } from "zod";
import { IdSchema, ImageUrlSchema, IsoDateTime, RoleSchema } from "./common";

export const ClubSchema = z.object({
  id: IdSchema,
  name: z.string(),
  location: z.string().nullable(),
  pictureUrl: ImageUrlSchema,
  bannerUrl: ImageUrlSchema,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Club = z.infer<typeof ClubSchema>;

export const ClubMemberSchema = z.object({
  id: IdSchema,
  name: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(RoleSchema),
  photoUrl: ImageUrlSchema,
  eloSingles: z.number(),
  eloDoubles: z.number(),
  joinedAt: IsoDateTime,
});
export type ClubMember = z.infer<typeof ClubMemberSchema>;

export const ClubDetailSchema = ClubSchema.extend({ members: z.array(ClubMemberSchema) });
export type ClubDetail = z.infer<typeof ClubDetailSchema>;
export const ClubListSchema = z.array(ClubSchema);

/**
 * Club create/update are multipart (images). An empty file removes the image; a missing field leaves it alone.
 * `location: ""` clears it.
 */
export const ClubFormSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  location: z.string().max(120).optional(),
  picture: z.file().max(10 * 1024 * 1024).optional(),
  banner: z.file().max(10 * 1024 * 1024).optional(),
});
export const CreateClubFormSchema = ClubFormSchema.extend({ name: z.string().min(2).max(80) });

export const AssignClubBodySchema = z.object({ userId: IdSchema, clubId: IdSchema.nullable() });
