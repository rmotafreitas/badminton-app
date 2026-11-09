import { z } from "zod";
import { IdSchema, ImageFileSchema, ImageUrlSchema, IsoDateTime, RoleSchema } from "./common";

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
  picture: ImageFileSchema,
  banner: ImageFileSchema,
});
export const CreateClubFormSchema = ClubFormSchema.extend({ name: z.string().min(2).max(80) });

export const AssignClubBodySchema = z.object({ userId: IdSchema, clubId: IdSchema.nullable() });

/** Club roles a club admin can give. SYSTEM_ADMIN is only honoured from a system admin. */
export const MemberRolesSchema = z.array(RoleSchema).max(4);

/** Add an existing account by id, or someone by email/phone (an unknown address becomes an invite). */
export const AddMemberBodySchema = z.union([
  z.object({ userId: IdSchema }),
  z.object({
    email: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
    name: z.string().max(80).optional(),
    roles: MemberRolesSchema.optional(),
  }),
]);
export const MemberParamsSchema = z.object({ id: IdSchema, userId: IdSchema });
export const SetMemberRolesBodySchema = z.object({ roles: MemberRolesSchema });
export const MemberRolesResponseSchema = z.object({ roles: z.array(RoleSchema) });
