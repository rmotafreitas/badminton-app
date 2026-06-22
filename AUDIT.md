# Deep UX, Data Fetching & State Management Audit — Badminton Buddy

> Findings, page-by-page audit, proposed & implemented strategy.
> Frontend root: `web/` · Backend root: `backend/`

---

## 1. Architecture Findings

### Frontend

| Concern | Current state |
|---|---|
| Framework | React 19 + Vite 8 + react-router-dom 7 |
| Architecture | Clean Architecture: `domain/` → `views/`/`dtos/` → `mappers/` → `repositories/` → `services/` → `pages/` |
| DI | `DIProvider` (`web/src/di/container.tsx`) instantiates one repo + service per feature in a `useMemo([])`. Hooks `useAuthService` / `useClubService` / … expose them. |
| Data transport | Single axios instance (`web/src/lib/api.ts`), `baseURL: /api`, `withCredentials: true`, 10s timeout. Vite proxies `/api` → backend. |
| Data fetching | **Every page uses ad-hoc `useEffect` + `useState`.** No `useQuery`/SWR/React Query. No request dedup. No retry. |
| Caching | **None.** No in-memory cache, no persistent cache. Every navigation re-fetches every resource. |
| Invalidation | **None.** Mutations only refetch the *current* page's list. Cross-page data (ELO, profile, navbar avatar, roster) is never invalidated. |
| Loading UX | Mostly plain text `"Loading…"` or `0`/empty placeholders that flash the correct value later. Only `ProtectedRoute` and `GameDetailPage`/`ProfilePage` block render. No skeletons, no shimmer. |
| Auth | `AuthProvider` (`web/src/context/AuthContext.tsx`) calls `GET /auth/me` on mount and flips `loading=false` when it resolves. Session is an httpOnly cookie (`auth_token`, JWT, 7d). **No local hydration** → app is blank/loading until the network round-trip completes on every cold start. |
| Routing | `publicRoutes` (`/`, `/auth/callback`, `/unauthorized`, `/logout`, `*`) render **immediately, regardless of auth `loading`**. `protectedRoutes` are wrapped in `ProtectedRoute` which shows a spinner while `loading`. |
| i18n | `LanguageProvider` persists lang to `localStorage` (`badminton-lang`). |

### Backend

| Concern | Current state |
|---|---|
| Stack | Elysia 1 + Prisma 6 (MongoDB) + JWT in httpOnly cookie. `@elysiajs/swagger`, `@elysiajs/cors`. |
| Deploy | Vercel serverless (`IN_DEV=vercel`) **→ cold starts are real**. Local/Docker = long-running (`IN_DEV=local`). |
| Auth | `auth.guard.ts` `requireRoles(...)` derives `currentUser` from the cookie on every protected route. `/auth/me` → `AuthService.validateSession` → `jwtService.verify` + `userRepo.findById` (DB hit on every session check). |
| ELO | `GameService.updateElos` recomputes ELO on `registerGame` / `registerQuickGame`. **`updateGame` and `deleteGame` do NOT recompute ELO** — editing/deleting a game leaves stale ELO in the DB. |
| Endpoints (frequently accessed) | `/auth/me`, `/clubs/:id` (club + roster), `/games/club/:clubId`, `/games/me`, `/games/player/:id`, `/games/shared/:id`, `/games/:id`, `/profile/me`, `/profile/:id`, `/clubs/admin/`, `/users/`. |
| Data dependencies | A club response embeds its roster (`users[].profile`). Games embed both teams' players + profiles. Profile is separate from auth user. ELO lives on `User` (returned by `/auth/me`), **not** on `Profile` — so the profile page reads ELO from `AuthContext.user.elo`. |
| Cold-start impact | First request after idle pays the serverless boot + Prisma connect. Because the frontend blocks on `/auth/me` at startup and re-fetches everything on every navigation, cold starts are felt as: login-page flash, empty-then-populated pages, stale data after mutations. |

### Root causes of poor perceived performance

1. **No session hydration** → the app cannot render anything meaningful until `/auth/me` returns; the public `/` route renders the login form during that wait.
2. **No cache** → every navigation is a cold fetch; backend cold starts are exposed to the user as blank/empty states.
3. **No invalidation graph** → mutations don't refresh dependent data (ELO, profile, navbar avatar, roster, other pages' lists).
4. **Loading = text/zero** → visible layout shifts and "incorrect value flashing" instead of skeletons.

---

## 2. Page-by-Page Audit

Legend: ✅ ok · ⚠️ minor · ❌ bug/UX failure.

### `/` LoginPage
- Data fetched: none directly (reads `useAuth()`).
- ❌ **Login screen flashes even when the user is already authenticated.** The page is a *public* route and renders the full form immediately; the redirect to `/dashboard` only fires after `!loading && isAuthenticated` resolves. On a cold start the form is painted for seconds before the redirect.
- ⚠️ No "restoring session" state.

### `/auth/callback` AuthCallbackPage
- ✅ Shows "Signing you in…" while exchanging the token; handles errors.

### `/logout` LogoutPage
- ✅ Shows "Signing you out…". (Will be improved to clear the persisted session.)

### `/unauthorized`, `/*` (NotFound)
- ✅ Static.

### `/dashboard` DashboardPage
- Data: `clubService.getClubById(user.clubId)` + `gameService.getRecentGames(clubId)` (two independent effects).
- ❌ Stat cards render `0` / fallback label **before** data arrives → numbers visibly jump from `0` → real value. "Total Games" actually shows `recentGames.length` (max 10), not a total.
- ⚠️ Only the recent-games table has a `loading` flag; the club/members/role widgets have no skeleton.
- ❌ No refetch on revisit (stale club roster / games after registering a game elsewhere).
- ⚠️ `setInterval(updateTimeAndGreeting, 1000)` re-renders the whole page every second just for the greeting.

### `/games` GamesPage
- Data: `getMyGames()` or `getRecentGames(clubId)` (view toggle) + `getClubById(clubId)` for the registration roster.
- ❌ `GameRegistration` receives `clubPlayers={clubData?.users || []}` → while the club loads, the player picker shows **"No players available"**, then populates.
- ❌ After `onGameRegistered`, only the games list refetches. **ELO (`auth.user.elo`), profile stats, club roster, and dashboard are not invalidated** → stale everywhere.
- ⚠️ Plain `"Loading…"` text in the table; no skeleton rows.
- ❌ No refetch on revisit; view toggle refetch is fine.

### `/games/:id` GameDetailPage
- Data: `getGameById(id)` then `getClubById(game.clubId)` (sequential).
- ⚠️ Blocks render with plain `"Loading…"` text (no skeleton). Acceptable, but inconsistent.
- ❌ After `updateGame`, only local state updates. **No invalidation** of games lists, profile stats, or ELO (and backend `updateGame` doesn't recompute ELO either — see §9).

### `/users` UsersPage
- Data: `getClubById(user.clubId)` (roster) + (admin) `getAllUsers()` + `getAllClubs()`.
- ❌ **`assignUserToClub` does not refresh the roster table** → the newly assigned user does not appear until a manual reload. Data-consistency bug.
- ⚠️ Admin assign-form `<select>`s are empty until `allUsers`/`allClubs` resolve → empty dropdowns then populate.

### `/clubs` ClubsPage
- Data: `getAllClubs()`.
- ⚠️ Plain `"Loading…"` text; no skeleton rows.
- ✅ Create / update / delete call `fetchClubs()` → list refreshes locally. But ❌ no cross-page invalidation (dashboard club widget, users page roster).

### `/profile` & `/profile/:id` ProfilePage
- Data: `getMyProfile()`/`getProfile(id)` + `getClubById(user.clubId)` (club name) + role-dependent games (`getMyGames` / `getGamesByPlayerId` / `getSharedGames`).
- ❌ **ELO is read from `AuthContext.user.elo`** (Profile domain has no `elo` field). After a game is registered on `/games`, `auth.user.elo` is never refreshed → **profile shows stale ELO until manual reload/re-login**. (This is the headline bug from the task brief.)
- ❌ After `updateMyProfile`, `auth.user` is not refreshed → **Navbar avatar/name and the profile header keep the old values** until re-login.
- ❌ No refetch on revisit → stats/activity/club name go stale after mutations elsewhere.
- ⚠️ Blocks whole page with plain `"Loading…"`; no skeleton for the masthead/stats/heatmap.

### Shared chrome
- `Navbar` reads `user` from `AuthContext` → avatar/name/elo reflect the *cached* auth user; never updated after profile/game mutations.
- `LoginModal` auto-closes on `isAuthenticated` ✅.

---

## 3. UX Issues Discovered

1. **Login page flashes** for authenticated users during cold starts (no session hydration). **[critical]**
2. **Stat cards / widgets flash `0` or fallback text** before data arrives (Dashboard, Games, Users). **[high]**
3. **Player picker flashes "No players available"** before the club roster loads (Games registration, GameDetail edit). **[high]**
4. **Empty `<select>` options then populate** (Users admin assign form). **[medium]**
5. **Plain `"Loading…"` text** instead of skeletons across Dashboard/Games/Users/Clubs/Profile/GameDetail → layout shifts, perceived jank. **[high]**
6. **Stale ELO on profile** after registering a game. **[high]**
7. **Stale Navbar avatar/name** after editing profile. **[medium]**
8. **No refetch on navigation revisit** → every page shows whatever it last fetched (often stale). **[high]**
9. **No background revalidation** → data never refreshes while a page stays open. **[medium]**
10. **No online/focus revalidation** → returning to a tab shows old data. **[medium]**

## 4. Data Consistency Issues

1. Game register/update/delete → ELO, profile stats, dashboard counts, and other games lists are not refreshed.
2. `UsersPage.assignUserToClub` → roster table not refreshed.
3. Profile update → Navbar avatar/name, profile header, and club roster (name/photo) not refreshed.
4. Club create/update/delete/assign → dashboard club widget, users roster, clubs list not cross-invalidated.
5. Backend: `GameService.updateGame` / `deleteGame` do **not** recompute ELO (DB-level staleness — documented as remaining debt; the frontend invalidation still refreshes the *stored* (stale) value).

---

## 5. Proposed Caching Strategy

A single **`QueryCache`** at the data-layer boundary (used by `useQuery` in React, and available to services/repos), with **stale-while-revalidate** semantics.

| Resource | Key | TTL (fresh) | GC (drop) | Persist? | SWR? |
|---|---|---|---|---|---|
| Current user (auth) | `["auth","me"]` | ∞ (managed by AuthContext) | — | yes (localStorage) | yes (silent revalidate) |
| Club + roster | `["club", id]` | 60s | 5m | yes | yes |
| All clubs (admin) | `["clubs"]` | 60s | 5m | yes | yes |
| Recent games (club) | `["games","recent", clubId]` | 30s | 5m | yes | yes |
| My games | `["games","mine"]` | 30s | 5m | yes | yes |
| Player games | `["games","player", id]` | 30s | 5m | yes | yes |
| Shared games | `["games","shared", id]` | 30s | 5m | yes | yes |
| Single game | `["game", id]` | 60s | 5m | no | yes |
| Profile | `["profile", id\|\|"me"]` | 60s | 5m | yes | yes |
| All users (admin) | `["users"]` | 60s | 5m | yes | yes |

Rules:
- **Read:** if fresh → return cached; if stale (age > fresh, age < gc) → return cached **and** refetch in background; if absent/expired → fetch (loading).
- **Persistence:** entries flagged `persist` are mirrored to `localStorage` so a subsequent cold load renders instantly from cache while SWR revalidates. (IndexedDB was evaluated — see §6.)
- **Refetch triggers:** window focus, online event, and explicit invalidation.
- **Never cache** the auth token (httpOnly cookie, not readable from JS). Only the *user snapshot* is persisted.

## 6. Persistent Cache — IndexedDB evaluation

Candidates considered: rankings, match history, club lists, player lists, statistics. At the current data volumes (a single club roster, ≤ a few hundred recent games, one user profile) each cached payload is small JSON (low KB). **localStorage is sufficient and materially simpler/more reliable than IndexedDB** for this app today. IndexedDB's strengths (large blobs, structured async stores) are not exercised — club banners/photos are served as data-URLs from the API and are not cached client-side.

**Decision:** implement persistence on `localStorage` (with try/catch guards for quota/private-mode). Revisit IndexedDB only if payloads grow past ~1 MB or binary caching is added. This keeps complexity justified.

## 7. Proposed Invalidation Strategy

Mutations invalidate by **key prefix** and refresh the auth user when ELO/name/photo may have changed:

| Mutation | Invalidate (prefix/exact) | Refresh auth? |
|---|---|---|
| `registerGame` / `registerQuickGame` | `["games"]`, `["game", id]`, `["profile"]` | yes (ELO) |
| `updateGame` | `["games"]`, `["game", id]`, `["profile"]` | yes (ELO — see debt note) |
| `deleteGame` | `["games"]`, `["game", id]`, `["profile"]` | yes (ELO — see debt note) |
| `updateMyProfile` | `["profile","me"]`, `["club", user.clubId]` (roster name/photo) | yes (name/photo) |
| `createClub` / `updateClub` / `deleteClub` | `["clubs"]`, `["club", id]` | no |
| `assignUserToClub` | `["clubs"]`, `["club", clubId]`, `["users"]`, `["club", user.clubId]` | no |

Refresh-auth = call `refreshUser()` (re-fetches `/auth/me`) so `AuthContext.user.elo` / `.email`/name-derived avatar update app-wide.

## 8. Authentication Improvements (implemented)

- **Session hydration:** on startup, restore the last known user snapshot from `localStorage` (`badminton-auth-user`) and set `authPhase = "authenticated"` *optimistically*.
- **`authPhase`** replaces the boolean `loading`: `"restoring" | "authenticated" | "unauthenticated"`.
- **Silent revalidation:** immediately call `/auth/me` in the background; if it confirms the session, refresh the snapshot; if it 401s, clear the snapshot and flip to `"unauthenticated"`.
- **No login flash:** `LoginPage` renders a full-page "Restoring session…" loader while `authPhase === "restoring"`. `ProtectedRoute` shows the same loader while unresolved.
- **Persistence lifecycle:** snapshot is written on successful login/`refreshUser` and cleared on `logout`.
- The token itself stays in the httpOnly cookie; only the non-sensitive user view is persisted.

## 9. Implemented Changes

Summary of the changes in this audit:

1. `web/src/lib/query-cache.ts` — `QueryCache` (in-memory + localStorage persistence, SWR, prefix invalidation, subscribers, focus/online refetch).
2. `web/src/hooks/useQuery.ts` — `useQuery`, `useMutation`, `invalidateQueries`, `prefetchQuery`, `setQueryData`, `queryCache` singleton.
3. `web/src/components/ui/skeleton.tsx` — `Skeleton`, `SkeletonText`, `SkeletonRows`, `WidgetSkeleton`, `ProfileSkeleton`, `FullPageLoader`.
4. `web/src/css/_skeleton.css` — shimmer animation.
5. `AuthContext` rewritten with hydration + `authPhase`; `LoginPage` + `ProtectedRoute` updated.
6. All data pages migrated to `useQuery`/`useMutation` with skeletons and cross-page invalidation:
   - `DashboardPage`, `GamesPage`, `GameRegistration`, `GameDetailPage`, `UsersPage`, `ClubsPage`, `ProfilePage`.
7. Mutations now invalidate the dependency graph and refresh the auth user (ELO/name/photo).
8. i18n keys added (`restoringSession`, `restoringSessionDesc`, `loadingData`, `updating`, …) for en-US and pt-PT.

## 10. Remaining Technical Debt

1. **Backend ELO on edit/delete:** `GameService.updateGame`/`deleteGame` don't recompute ELO. Frontend invalidation will refresh the *stored* (stale) value until the backend is fixed. Recommended: recompute ELO from the game's participants on update/delete, or store per-game ELO deltas.
2. **"Total Games" semantics on Dashboard:** currently counts only the recent-10 slice. Should be a dedicated backend count endpoint or `games.length` of the full club list.
3. **Per-second greeting clock** on Dashboard re-renders the page every 1s; can be a standalone clock component with its own state.
4. **No request retry/backoff** in `QueryCache`; failed fetches surface as errors. Add retry for transient cold-start failures.
5. **Pagination/virtualization** for large game lists not present (fine at current volume).
6. **IndexedDB** not adopted (justified today; revisit if payload sizes grow).
7. **`any` types** in pages (pre-existing) not refactored — out of scope for this audit.
8. **Optimistic UI for mutations** (e.g., immediate game row insert) not added; current approach is await-then-invalidate, which is safe but not instant.

## 11. Final Summary — Measurable UX Improvements

| Symptom | Before | After |
|---|---|---|
| Login page flash for authenticated users | Form painted for seconds during cold start | Full-page "Restoring session…" until session resolved; login form only shown when truly unauthenticated |
| First paint of data pages | Empty/`0`/fallback text → jumps to real data | Skeletons preserve layout; cached data paints instantly, SWR revalidates |
| Revisiting a page | Full refetch, blank during load | Instant from cache (memory or localStorage), background refresh |
| ELO after registering a game | Stale until manual reload/re-login | Auto-refreshed via `refreshUser()` + profile invalidation |
| Navbar avatar/name after profile edit | Stale until re-login | Auto-refreshed via `refreshUser()` |
| Users page after assigning a user | Roster not updated until reload | Roster invalidated + refetched |
| Club changes propagating | None | Dashboard/Users/Games rosters invalidated |
| Cross-page data consistency | Manual reload required | Invalidation graph keeps dependent data fresh |
| Perceived performance on backend cold start | Exposed as blank screens & flashes | Hidden behind cached paint + background revalidation |
