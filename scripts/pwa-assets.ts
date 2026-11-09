/**
 * Generates the PWA assets that are pure derivatives of the logo and of the E2E screenshots:
 *  - iOS launch screens (light and dark) for current iPhones, plus their <link> tags in index.html;
 *  - manifest screenshots (Chrome on Android shows an app-store-like install dialog when they exist).
 *
 *   bun scripts/pwa-assets.ts            (run `bun run test:e2e` first for fresh screenshots)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const web = path.resolve(import.meta.dir, "../apps/web");
const pub = path.join(web, "public");
const logo = path.join(pub, "icon-512.png");

/** [css width, css height, device pixel ratio] — iPhone SE up to 16 Pro Max. */
const IPHONES: [number, number, number][] = [
  [375, 667, 2],
  [414, 896, 2],
  [375, 812, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
];
const THEMES = { light: "#ffffff", dark: "#121a15" } as const;

mkdirSync(path.join(pub, "splash"), { recursive: true });
const links: string[] = [];
for (const [w, h, dpr] of IPHONES) {
  for (const [scheme, background] of Object.entries(THEMES)) {
    const width = w * dpr;
    const height = h * dpr;
    const size = Math.round(width * 0.32);
    const icon = await sharp(logo).resize(size, size).png().toBuffer();
    const file = `splash/iphone-${width}x${height}-${scheme}.png`;
    await sharp({ create: { width, height, channels: 4, background } })
      .composite([{ input: icon, left: Math.round((width - size) / 2), top: Math.round((height - size) / 2 - height * 0.04) }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(pub, file));
    links.push(
      `    <link rel="apple-touch-startup-image" href="/${file}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})" />`,
    );
  }
}
const indexPath = path.join(web, "index.html");
const index = readFileSync(indexPath, "utf8");
const start = "    <!-- splash:start -->";
const end = "    <!-- splash:end -->";
const block = [start, ...links, end].join("\n");
writeFileSync(
  indexPath,
  index.includes(start) ? index.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block) : index.replace("  </head>", `${block}\n  </head>`),
);

// Manifest screenshots from the E2E run.
const shots = path.resolve(import.meta.dir, "../e2e/screenshots");
const wanted = [
  { from: "mobile-scoreboard.png", form: "narrow", label: "Keep score one-handed: tap your half after every rally" },
  { from: "mobile-dashboard.png", form: "narrow", label: "Your ratings, form and club at a glance" },
  { from: "mobile-games.png", form: "narrow", label: "Every game and result" },
  { from: "mobile-training.png", form: "narrow", label: "Log how hard you trained" },
  { from: "desktop-dashboard.png", form: "wide", label: "Dashboard" },
  { from: "desktop-profile.png", form: "wide", label: "Rating history and stats" },
];
mkdirSync(path.join(pub, "screenshots"), { recursive: true });
const screenshots = [];
for (const s of wanted) {
  const src = path.join(shots, s.from);
  if (!existsSync(src)) continue;
  const out = `screenshots/${s.from.replace(".png", ".webp")}`;
  const image = sharp(src).resize(s.form === "narrow" ? { width: 1080 } : { width: 1440, height: 900, fit: "cover", position: "top" });
  const info = await image.webp({ quality: 82 }).toFile(path.join(pub, out));
  screenshots.push({ src: `/${out}`, sizes: `${info.width}x${info.height}`, type: "image/webp", form_factor: s.form, label: s.label });
}
const manifestPath = path.join(pub, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (screenshots.length) manifest.screenshots = screenshots;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
// biome-ignore lint/suspicious/noConsole: script output
console.log(`${links.length} launch screens, ${screenshots.length} screenshots`);
