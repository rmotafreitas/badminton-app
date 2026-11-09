import type { RallySession as RallySessionDto } from "@bb/contracts";
import { type Api, unwrap } from "@/app/api";
import type { RallyProfileEntry, RallySession } from "./model";
import type { RallyRepo } from "./port";

/** Contract (ISO strings) → the engine's model (Dates). */
const toSession = (s: RallySessionDto): RallySession =>
  ({
    ...s,
    recordedAt: new Date(s.recordedAt),
    videoExpiresAt: s.videoExpiresAt ? new Date(s.videoExpiresAt) : null,
    analysisLock: s.analysisLock ? { deviceId: s.analysisLock.deviceId, until: new Date(s.analysisLock.until) } : null,
  }) as RallySession;

/** The rally session manager's server port, over the typed API client. */
export function edenRallyRepo(api: Api): RallyRepo {
  const one = (id: string) => api["rally-sessions"]({ id });
  return {
    create: async (params) => toSession(unwrap(await api["rally-sessions"].post(params))),
    list: async () => unwrap(await api["rally-sessions"].get()).map(toSession),
    get: async (id) => toSession(unwrap(await one(id).get())),
    listForGame: async (gameId) => unwrap(await api["rally-sessions"].game({ gameId }).get()).map(toSession),
    profile: async (userId) =>
      unwrap(await api["rally-sessions"].profile({ userId }).get()).map(
        (e) => ({ ...e, recordedAt: new Date(e.recordedAt) }) as RallyProfileEntry,
      ),
    update: async (id, params) => toSession(unwrap(await one(id).patch(params))),
    delete: async (id) => void unwrap(await one(id).delete()),
    leave: async (id) => void unwrap(await one(id).participants.me.delete()),
    usage: async () => unwrap(await api["rally-sessions"].usage.get()),
    requestVideoUpload: async (id, bytes, contentType) => unwrap(await one(id)["video-upload"].post({ bytes, contentType })),
    completeVideoUpload: async (id, key, bytes) => toSession(unwrap(await one(id)["video-complete"].post({ key, bytes }))),
    videoUrl: async (id) => {
      const { url, expiresAt } = unwrap(await one(id)["video-url"].get());
      return { url, expiresAt: expiresAt ? new Date(expiresAt) : null };
    },
    lock: async (id, deviceId) => {
      const lock = unwrap(await one(id).lock.post({ deviceId }));
      return { deviceId: lock.deviceId, until: new Date(lock.until) };
    },
    unlock: async (id, deviceId, failed) => void unwrap(await one(id).unlock.post({ deviceId, failed })),
    requestResultUpload: async (id) => unwrap(await one(id)["result-upload"].post()),
    submitResult: async (id, body) => toSession(unwrap(await one(id).result.post(body))),
    resultUrl: async (id) => unwrap(await one(id)["result-url"].get()),
  };
}
