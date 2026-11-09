import { z } from "zod";
import { CalendarDay, IdSchema, ImageFileSchema, ImageUrlSchema, IsoDateTime, RoleSchema } from "./common";

export const ProfileSchema = z.object({
  userId: IdSchema,
  name: z.string(),
  /** Only for the person, admins and staff of their club; null otherwise. */
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roles: z.array(RoleSchema),
  clubId: IdSchema.nullable(),
  birthday: CalendarDay.nullable(),
  sex: z.string().nullable(),
  bio: z.string().nullable(),
  photoUrl: ImageUrlSchema,
  bannerUrl: ImageUrlSchema,
  eloSingles: z.number(),
  eloDoubles: z.number(),
  memberSince: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Profile = z.infer<typeof ProfileSchema>;

/** Multipart. An empty file removes the image; a missing field leaves it alone; "" clears a text field. */
export const UpdateProfileFormSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  birthday: z.union([CalendarDay, z.literal("")]).optional(),
  sex: z.string().max(20).optional(),
  bio: z.string().max(500).optional(),
  photo: ImageFileSchema,
  banner: ImageFileSchema,
});
