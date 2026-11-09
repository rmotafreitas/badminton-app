# Architecture: how Badminton Buddy is built, and how to add things

This mirrors the ASMR startup's architecture (`the-asmr-app`: ADR-0006 typed client, ADR-0007 application architecture,
ADR-0008 caching), adapted to MongoDB and Vercel. `tests/architecture.test.ts` enforces the import rules: if it fails,
fix the import; don't add an exception.

## The map

```
apps/
  api/             Elysia HTTP API under /api (composition roots: src/main.ts local, src/vercel.ts serverless)
                   src/http/ (auth macro, CSRF, errors, cookies, request context), src/modules/<context>/routes.ts
  web/             React + Vite PWA: TanStack Router (file routes) + TanStack Query, shadcn/ui
packages/
  domain/          entities, policies, ratings, DomainError subclasses        (no third-party code)
  application/     use cases (class + execute) and ports, per context         (imports domain only)
  infrastructure/  adapters: Prisma/MongoDB repositories, S3, SMTP, Twilio, Google, sharp, rate limiter
  bootstrap/       createInfrastructure(config) + create<Context>Module(infra): the only wiring
  contracts/       zod schemas of every request/response, shared with the web app
  config/          validated environment (the only reader of process.env)
  testing/         in-memory fakes of every port (no database needed for tests)
scripts/           seed, demo seed, rating replay, image backfill
tests/             architecture rules + system tests (the whole API in-process over fakes)
```

Contexts: `identity · clubs · games · profiles · training · rally · media`.

**Dependency rules:** `domain ← application ← infrastructure ← bootstrap ← apps/api`. The web app may import only
`@bb/contracts`, plus the API's **type** (`import type { App } from "@bb/api"`) for the Eden client. No `../` imports:
`./x` for the same folder, `@/x` for the rest of the package, `@bb/<pkg>` across packages. In the web app a feature
reaches another feature only through its `index.ts`, and `shared/` imports no feature.

## Server

- **Routes never touch Prisma or S3.** A route validates with the contracts, calls **one** use case with plain inputs
  (never Elysia's context) and maps the result through `modules/presenters.ts` (dates → ISO, images → URLs).
- **Authentication** is the `auth`/`optionalAuth` macro (`http/auth.ts`): an opaque session token in the
  `__Host-bb_session` HttpOnly cookie; only its SHA-256 is stored (`AuthSession`). Sessions last 30 days and slide when
  used. Roles and club are read fresh on every request, so a role change applies at once.
  There are deliberately **no access/refresh tokens**: refresh tokens exist to make short-lived stateless JWTs
  revocable, and a server-side session already is (sign-out, deactivation and expiry act on the next request). The
  cookie is `HttpOnly; Secure; SameSite=Lax` and `__Host-` scoped, so script can't read it and no subdomain can set it.
  The home-screen app signs in with codes (an emailed link would open the browser, which on iOS has other cookies).
- **Authorization** lives in use cases and domain policies (`canViewClub`, `canManageClub`, `canViewGame`,
  `registerGameProblem`, `rallyAccess`, `canSeeContactDetails`). Not in routes: a route guard is not a data boundary.
  Things a caller may not know exist answer **404**, not 403.
- **Errors** map to HTTP in one place (`http/errors.ts`): `Unauthenticated` 401, `Forbidden` 403, `NotFound` 404,
  `Conflict` 409, `QuotaExceeded` 413, `BusinessRuleViolation`/invalid input 422, `RateLimited` 429, anything else 500
  with a request id and no internals. Every error body is `ErrorResponseSchema`.
- **CSRF:** a cookie-bearing write must come from `APP_URL`'s origin and be JSON or multipart (`http/csrf.ts`). No CORS:
  the browser reaches `/api` on the web app's own origin (Vercel rewrite, nginx, or the Vite proxy).
- **Operations:** `GET /api/health` (liveness) and `/api/health/ready` (MongoDB ping, 503 when down). A daily Vercel
  Cron calls `/api/maintenance/daily` with `CRON_SECRET`: expired review videos, sessions, sign-in codes and rate-limit
  windows are deleted. Every response carries `nosniff`, `X-Frame-Options: DENY` and a strict referrer policy.
- **Rate limits:** sign-in sends (5 / 15 min per address) and attempts (10 / 15 min per address) through the
  `RateLimiter` port (MongoDB fixed windows; a Redis adapter would drop in).

### Caching (server)

- Every `/api` response is `Cache-Control: private, no-store` (set before routing, errors included).
- **Images are no longer inlined as base64 in JSON.** Profiles and clubs store a content version (`photoVersion`, …);
  responses carry `/api/media/<owner>/<id>/<kind>/<version>`, served as bytes with
  `private, max-age=31536000, immutable`. A changed photo gets a new URL. After deploying, run
  `bun run db:backfill-images` once.
- The `Cache` port exists with a `NoopCache` default. Cache only immutable or staleness-tolerant data, never anything
  per user under a key without the user, and fail open.
- No N+1: a page of games loads all its players with one `PlayerDirectory` query.

### Add a use case / route
1. Rule in `packages/domain` if there is one; throw the matching `DomainError`.
2. Port in `application/src/<context>/ports.ts`, use case class with `execute(input)`; authorization here.
3. Adapter in `infrastructure`, wired in `packages/bootstrap` (`createInfrastructure` / `create<Context>Module`).
4. Schema in `packages/contracts`; route in `apps/api/src/modules/<context>/routes.ts` declaring `body`/`params` and a
   `response` for every status, so Eden types it.
5. Test with `tests/support.ts`: `testApi()` runs the real HTTP layer and use cases over `@bb/testing` fakes.

### Data screens (generic CRUD per table)

`/data` gives club staff and system admins a list / search / filter / sort / page / CSV / view / create / edit / delete
screen for every collection, from one table registry: `packages/application/src/data/registry.ts`. Each table lists
its fields (label in en/pt, type, and whether it is listed, searched, sorted, filtered, created, edited) and `access` per
role: `scope: "all"` or `"club"` (only rows of the actor's club, via `clubField`), plus create / update / delete and
which fields that role may set. Players see no tables.

- **Reads** go through the `RecordStore` port (`PrismaRecordStore`): it selects only registry fields, so secrets
  (password and token hashes) never leave the server. Search terms are regex-escaped: Prisma's MongoDB `contains`
  does **not** escape them.
- **Writes never touch the store directly.** Each table's handler (`data/data.ts`) calls the use case that owns the
  rules: clubs → `CreateClub`/`UpdateClub`/`DeleteClub`; users → `CreateAccount`/`UpdateAccount`/`DeleteAccount`
  (system admins) or `AddClubMember`/`SetMemberRoles`/`RemoveClubMember` (club admins); games → `UpdateGame`/`DeleteGame`
  (ratings replay). Fields a role may not set are a 400, not silently dropped.
- **Add a table:** an entry in `TABLES`, a mapping in `PrismaRecordStore` (and the fake in `@bb/testing`), and a handler
  if anything can be changed. The web renders it with no further code.

**Club membership** (`clubs/members.ts`): club admins add people to their own club (an unknown email/phone becomes an
invite: the account is created now and linked on first sign-in, even with registration closed), change roles (never
SYSTEM_ADMIN) and remove members (club roles go, games stay). A club always keeps one club admin.

### Registration form ("Ficha de Inscrição")

Members print their club's season registration form pre-filled, sign it and hand it in; the club admin records it.

- **Details** (`MemberDetails`: BI/CC, NIF, address, NIB, a legal guardian for minors) are private: the person, their
  club's admins and system admins (`canSeePersonalDetails`); not coaches. The person can erase them. Gaps are filled
  from the profile/account (name, sex, birthday, phone, email). The web never persists these queries to IndexedDB.
- **Form text** is per club (`Club.registrationForm`: season, fee, declaration with `{fee}` `{season}` `{club}`,
  footer), defaulting to CFBG's 2024 form (`DEFAULT_REGISTRATION_FORM`). The logo is the club picture.
- **The PDF is drawn in the browser** (`features/registrations/pdf.ts`, pdf-lib, standard fonts, always Portuguese).
  pdf-lib loads only when someone taps Download. Phones get the share sheet (print, Files, WhatsApp).
- **One `Registration` per member, club and season**, created when the form is first downloaded. The club admin ticks
  "signed form received" and then "approved" (fills "Aprovado em"); un-ticking received withdraws the approval.
- **Signed scans** go to object storage (R2) through a presigned PUT, like rally videos, and are read through
  10-minute links. Without a bucket (`storageConfigured: false`) the upload is hidden and the checkbox is the record.
  Deleting an account deletes its scans.

After deploying: `bun run db:push` (new collections and the unique `userId+clubId+season` index).

## Web

```
src/app/        api.ts (Eden client, unwrap → ApiError), query-client.ts (retries, global 401), cache-persistence.ts,
                router.tsx (composition root), context.ts, loaders.ts
src/routes/     TanStack file routes (thin: guards, loaders, layout). `_app` is the signed-in layout.
src/features/   <feature>/api.ts (key factory + queryOptions + mutations), components, index.ts
src/shared/     ui/ (shadcn), components/, lib/, i18n/ (pt-PT, en-US), theme.tsx
```

- **Server state is TanStack Query only**: one `queryOptions` per resource, used by loaders and components.
- **Session:** `GET /api/auth/session` answers `{ user }` or `null` (never a 401). The root route resolves it before
  any guard runs. A returning user starts from a snapshot of their last session (`localStorage`, no token inside) so
  the app paints at once even while the API cold-starts; the API is asked in the background and wins.
- **Invalidation graph:** a game changes ratings, so it invalidates games, profiles, the club roster and the session
  user (`invalidateAfterGame`). Profile edits refresh the session, rosters and game cards.
- **Persistence:** queries with `meta: { persist: true }` (club, games, profile, training) are kept per user in
  IndexedDB and restored on start. Sign-out cancels in-flight queries, wipes the persisted cache and clears memory, in
  that order, so nothing can repopulate it. Bump `CACHE_SCHEMA_VERSION` when a persisted shape changes.
- **Global 401:** any query or mutation answered 401 ends the session locally and redirects to `/login?redirect=…`.
- **Writes** always send `content-type: application/json` (the CSRF guard needs it, even for DELETE). Multipart
  (images) goes through `sendForm`.
- **Service worker** (`public/sw.js`): never caches `/api`; navigations network-first for 2.5 s, then the cached
  shell (weak gym Wi-Fi never stalls the start); hashed assets cache-first.
- **Code splitting:** `"sideEffects"` in `apps/web/package.json` lets route files import feature barrels without
  dragging whole features into the entry chunk. A module with import-time effects (like `features/install/install.ts`)
  must be listed there. Heavy, below-the-fold libraries load lazily (`recharts` on the profile, `mediabunny` and ONNX
  only on Rally pages).

### A sleeping API never blocks the UI

The API is a serverless function: after a quiet spell its first request pays a cold start (function boot + the first
MongoDB connection). Rules that keep that invisible:

- **Wake it early.** `index.html` pings `/api/health/ready` before the app's code has even downloaded.
- **Paint from what we have.** A returning user starts from the session snapshot, and the persisted query cache is
  restored *before* the first route loads (≤ 500 ms budget), so pages render from IndexedDB and revalidate. A device
  with nobody signed in shows the login page after 1.5 s at most; a late answer that names someone still signs them in.
- **Details open from lists.** `gameQuery(api, id, queryClient)` takes its initial data from any cached list, so tapping
  a game is instant; the detail request only revalidates.
- **Writes don't wait for refetches.** A mutation writes the server's answer into every cache that shows it
  (`rememberGame`, `forgetGame`, `rememberReview`, `setQueryData`) and invalidates the rest *without awaiting*: the sheet
  closes as soon as the write returns. Deletes are optimistic with rollback.
- **Say what's happening.** `NetworkActivity` shows a thin bar after 400 ms of any request and "Waking up the server…"
  after 3 s; offline has its own banner. Reads retry 5xx/network errors with backoff; writes never auto-retry.
- **Small function.** `apps/api/scripts/bundle.ts` ships one bundled file plus only runtime dependencies, a Prisma client
  for the build machine only, and prunes other databases' engines, source maps and the other libc's sharp binaries
  (~60 MB instead of 275 MB). Heavy adapters (`sharp`, `google-auth-library`) load on first use; SMS is one REST call
  to Twilio instead of the SDK.

### Phones and the PWA

People use this mid-session: one hand, sweaty, between rallies. Rules that follow from that:

- **No keyboard for numbers.** Scores come from `ScorePicker` (a 0–30 grid with a big "21"), effort from a 1–10 grid,
  dates from chips (Today / Yesterday / Other day). Typing is only for search and notes.
- **No mode questions.** The game form has one score row: that's a points game. "Add set" turns it into sets. Players
  who play start on team 1; picking a team 1 score moves straight on to team 2's.
- **Phone layout below 1024 px** (`lg`): bottom tabs, sidebar as a sheet, sheets instead of dialogs. Tablets in
  portrait and phones in landscape are touch devices without room for a sidebar, so they get it too. Short screens
  (landscape, `short:` variant, < 480 px tall) shrink the header and tabs to icons.
- **Thumb zone.** Pick-one lists and forms open as bottom sheets (`ResponsiveSheet`: vaul drawer on phones, a dialog on
  desktop) with the primary action pinned at the bottom; targets are at least 44px (`tap-target`), most 56px.
- **Keep score** (`/score`, `features/games/scoring.ts`): tap your half or theirs per rally. Pure replay of rallies →
  score, server, service court, game over, change ends at 11 in a decider; undo is "drop the last rally". The match
  is saved in `localStorage` per user (survives a reload or a locked phone) and the screen stays on (Wake Lock).
- **Safe areas.** `viewport-fit=cover` + `black-translucent` status bar on iOS, Android edge-to-edge: anything touching
  an edge uses `pt-safe` / `pb-safe` / `px-safe` (`env(safe-area-inset-*)`): header, bottom tabs, sheets, toasts.
- **Install** (`features/install`): Chromium's `beforeinstallprompt` is captured at startup; where there's no prompt
  (iOS, Firefox) the same "Install" button shows the Share → Add to Home Screen steps. The dashboard card can be
  snoozed for three weeks; the account menu always has "Install app". The manifest carries a description, screenshots
  and shortcuts (richer Android install sheet); iOS gets splash screens. `bun scripts/pwa-assets.ts` regenerates both
  (screenshots from `e2e/screenshots/`, so run the E2E suite first).

### Add a page
1. `src/features/<f>/api.ts`: key factory and `queryOptions` (set `staleTime`, `meta.persist` when it should survive a
   restart). Mutations call the matching `invalidate…` helper.
2. Components with shadcn primitives from `@/shared/ui` and theme tokens (`bg-primary`, `text-muted-foreground`, …).
   Strings go in `src/shared/i18n/ui.ts` (both languages; the type enforces it).
3. `src/routes/_app/<name>.tsx`: loader prefetches or `routeData(ensureQueryData(...))` (an API 404 becomes the
   not-found page), role-only areas `requireRole(...)` (they 404 for everyone else).

## Checks

`make check` = typecheck (TS project references) + unit/system/architecture tests + web tests. Integration and
end-to-end tiers: [testing.md](testing.md).
