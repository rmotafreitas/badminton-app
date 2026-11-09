/**
 * One-off after deploying the image routes: give every stored profile/club image its content version, so its URL
 * (`/api/media/.../<version>`) can be cached forever. Idempotent: rows that already have a version are skipped.
 *
 *   bun run db:backfill-images
 */
import { loadConfig } from "@bb/config";
import { createDatabase, imageVersion } from "@bb/infrastructure";

const db = createDatabase(loadConfig().databaseUrl);

const version = (stored: string | null) => (stored ? imageVersion(stored) : null);

let updated = 0;
for (const p of await db.profile.findMany({ select: { id: true, photo: true, banner: true, photoVersion: true, bannerVersion: true } })) {
  const data = {
    ...(p.photo && !p.photoVersion && { photoVersion: version(p.photo) }),
    ...(p.banner && !p.bannerVersion && { bannerVersion: version(p.banner) }),
  };
  if (Object.keys(data).length) {
    await db.profile.update({ where: { id: p.id }, data });
    updated++;
  }
}
for (const c of await db.club.findMany({ select: { id: true, profilePicture: true, banner: true, pictureVersion: true, bannerVersion: true } })) {
  const data = {
    ...(c.profilePicture && !c.pictureVersion && { pictureVersion: version(c.profilePicture) }),
    ...(c.banner && !c.bannerVersion && { bannerVersion: version(c.banner) }),
  };
  if (Object.keys(data).length) {
    await db.club.update({ where: { id: c.id }, data });
    updated++;
  }
}
// biome-ignore lint/suspicious/noConsole: script output
console.log(`Backfilled image versions on ${updated} profile/club rows.`);
await db.$disconnect();
