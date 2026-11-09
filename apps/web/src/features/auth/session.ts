import type { SessionUser } from "@bb/contracts";
import { isUnavailable } from "@/app/api";
import type { AppContext } from "@/app/context";
import { readSession, sessionKey, sessionQuery, signOutRequest, writeSession } from "./api";
import { sessionSnapshot } from "./snapshot";

/** How long the first paint may wait for the persisted cache (a local IndexedDB read: usually a few ms). */
const RESTORE_BUDGET_MS = 500;
/** How long a device with nobody signed in waits for the API before showing the login page anyway. */
const FIRST_ANSWER_BUDGET_MS = 1_500;
const LATE = Symbol("late");
const delay = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export type AuthState =
  | { readonly kind: "signed-in"; readonly user: SessionUser }
  | { readonly kind: "anonymous" }
  /** The API could not be reached and nobody was signed in on this device. */
  | { readonly kind: "unreachable" };

/**
 * Resolves who is signed in BEFORE any guard runs (no async auth race). Order:
 *   1. the session query already in memory;
 *   2. the snapshot of the last signed-in user: used at once, revalidated in the background (stale-while-revalidate);
 *   3. otherwise, ask the API and wait.
 */
export async function loadAuth(context: AppContext): Promise<AuthState> {
  const { queryClient, api, persistence } = context;
  const inMemory = readSession(queryClient);
  if (inMemory !== undefined) return toState(inMemory);

  const snapshot = sessionSnapshot.read();
  if (snapshot) {
    queryClient.setQueryData(sessionQuery(api).queryKey, snapshot, { updatedAt: 0 });
    // Ask the API first (it may be waking up), then restore this user's cached pages from IndexedDB so the first
    // route already has its data: loaders find it instead of waiting on the network. A slow or broken IndexedDB
    // never holds the app back for more than a moment.
    void queryClient.refetchQueries({ queryKey: sessionQuery(api).queryKey, exact: true });
    await Promise.race([persistence.attach(queryClient, snapshot.id), delay(RESTORE_BUDGET_MS, undefined)]);
    return toState(snapshot);
  }

  try {
    // Nobody was signed in on this device: don't hold the login page hostage to a sleeping API. If the answer comes
    // late and does name someone (a cookie without a snapshot), `sessionRevalidated` signs them in then.
    const user = await Promise.race([queryClient.fetchQuery(sessionQuery(api)), delay(FIRST_ANSWER_BUDGET_MS, LATE)]);
    if (user === LATE) return { kind: "anonymous" };
    if (user) await bindUser(context, user);
    return toState(user);
  } catch (error) {
    if (isUnavailable(error)) return { kind: "unreachable" };
    throw error;
  }
}

const toState = (user: SessionUser | null): AuthState => (user ? { kind: "signed-in", user } : { kind: "anonymous" });

async function bindUser({ queryClient, persistence }: AppContext, user: SessionUser) {
  sessionSnapshot.save(user);
  await persistence.attach(queryClient, user.id);
}

/**
 * Forget everything that belongs to the person who was signed in, in an order that leaves no window for a late
 * response to put it back: cancel in-flight queries → stop persisting and wipe → clear memory → session null.
 */
async function forgetUserData({ queryClient, persistence }: AppContext) {
  // Snapshot first: anything reacting to the session becoming null must already see "nobody signed in".
  sessionSnapshot.clear();
  writeSession(queryClient, null);
  await queryClient.cancelQueries();
  await persistence.wipe();
  queryClient.clear();
  writeSession(queryClient, null);
}

/** A sign-in just succeeded: the guards need no round trip to learn who it is. */
export async function startSession(context: AppContext, user: SessionUser) {
  const previous = sessionSnapshot.read();
  if (previous && previous.id !== user.id) await forgetUserData(context);
  // A session check sent before the cookie existed may still be in flight: its "nobody" must not land after this.
  await context.queryClient.cancelQueries({ queryKey: sessionKey, exact: true });
  writeSession(context.queryClient, user);
  await bindUser(context, user);
}

/**
 * The session query answered on its own (not our setQueryData): what the router must do about it.
 * - `"expired"`: there was a user and the API says nobody: the global 401 policy takes over.
 * - `"appeared"`: nobody was known on this device, but the cookie names someone (the answer came after the login
 *   page was already showing): bind them and re-run the guards.
 * - `null`: keep the snapshot in step (name, photo, ratings, roles) and carry on.
 */
export async function sessionRevalidated(context: AppContext, user: SessionUser | null): Promise<"expired" | "appeared" | null> {
  const known = sessionSnapshot.read();
  if (!user) return known ? "expired" : null;
  if (known?.id === user.id) {
    sessionSnapshot.save(user);
    return null;
  }
  await bindUser(context, user);
  return known ? null : "appeared";
}

let expiring = false;

/** Global 401 policy: session gone → user data gone → guards re-run and redirect to the login page. Never re-entrant. */
export async function expireSession(context: AppContext, invalidate: () => Promise<void>) {
  if (expiring) return;
  if (readSession(context.queryClient) === null && !sessionSnapshot.read()) return;
  expiring = true;
  try {
    await forgetUserData(context);
    await invalidate();
  } finally {
    expiring = false;
  }
}

/** Sign-out: the request first (best effort: offline still signs out locally), then the same cleanup. */
export async function signOut(context: AppContext) {
  await signOutRequest(context.api).catch(() => undefined);
  await forgetUserData(context);
}
