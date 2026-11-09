import { z } from "zod";
import { IdSchema, IsoDateTime } from "./common";

export const RallyFormatSchema = z.enum(["singles", "doubles", "practice"]);
export const RallyParticipantSchema = z.object({ playerId: z.string(), userId: IdSchema });

/** Full access: owner and linked players. Summary access: club-mates (no video, no corrections). */
export const RallySessionSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  title: z.string().nullable(),
  recordedAt: IsoDateTime,
  durationS: z.number(),
  status: z.enum(["pending", "analysing", "analysed", "failed"]),
  format: RallyFormatSchema.nullable(),
  gameId: IdSchema.nullable(),
  trainingDate: z.string().nullable(),
  participants: z.array(RallyParticipantSchema),
  summary: z.unknown(),
  access: z.enum(["full", "summary"]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  clientId: z.string().optional(),
  hasVideo: z.boolean().optional(),
  videoBytes: z.number().nullable().optional(),
  videoExpiresAt: IsoDateTime.nullable().optional(),
  pinned: z.boolean().optional(),
  hasResult: z.boolean().optional(),
  corrections: z.unknown().optional(),
  analysisLock: z.object({ deviceId: z.string(), until: IsoDateTime }).nullable().optional(),
  shareForTraining: z.boolean().optional(),
});
export type RallySession = z.infer<typeof RallySessionSchema>;
export const RallySessionListSchema = z.array(RallySessionSchema);

export const CreateRallySessionBodySchema = z.object({
  clientId: z.string().min(8).max(64),
  title: z.string().max(120).nullable().optional(),
  recordedAt: z.string(),
  durationS: z.number().min(0),
  gameId: z.string().nullable().optional(),
  trainingDate: z.string().nullable().optional(),
});

export const UpdateRallySessionBodySchema = z.object({
  title: z.string().max(120).nullable().optional(),
  format: RallyFormatSchema.nullable().optional(),
  gameId: z.string().nullable().optional(),
  trainingDate: z.string().nullable().optional(),
  participants: z.array(RallyParticipantSchema).max(6).optional(),
  pinned: z.boolean().optional(),
  corrections: z.unknown().optional(),
  shareForTraining: z.boolean().optional(),
});

export const RallyUsageSchema = z.object({ usedBytes: z.number(), limitBytes: z.number() });
export const VideoUploadBodySchema = z.object({ bytes: z.number().min(1), contentType: z.string() });
export const VideoUploadSchema = z.object({
  key: z.string(),
  url: z.string(),
  contentType: z.string(),
  usage: RallyUsageSchema,
  overSoftCap: z.boolean(),
});
export const VideoCompleteBodySchema = z.object({ key: z.string(), bytes: z.number().min(1) });
export const VideoUrlSchema = z.object({ url: z.string(), expiresAt: IsoDateTime.nullable() });
export const LockBodySchema = z.object({ deviceId: z.string().min(8).max(64) });
export const LockSchema = z.object({ deviceId: z.string(), until: IsoDateTime });
export const UnlockBodySchema = z.object({ deviceId: z.string(), failed: z.boolean().optional() });
export const ResultUploadSchema = z.object({ key: z.string(), url: z.string() }).nullable();
export const SubmitResultBodySchema = z.object({
  summary: z.unknown(),
  format: RallyFormatSchema,
  resultKey: z.string().nullable().optional(),
  deviceId: z.string(),
});
export const ResultUrlSchema = z.object({ url: z.string() });
export const ProfileRallySessionSchema = z.object({
  id: IdSchema,
  recordedAt: IsoDateTime,
  durationS: z.number(),
  format: RallyFormatSchema.nullable(),
  playerId: z.string(),
  summary: z.unknown(),
});
export const ProfileRallySessionListSchema = z.array(ProfileRallySessionSchema);
