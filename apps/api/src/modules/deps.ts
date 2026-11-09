import type { Clock, Logger } from "@bb/application";
import type { Modules } from "@bb/bootstrap";

/** What the HTTP layer needs: the use cases (from @bb/bootstrap, or built over fakes in tests) plus a few settings. */
export interface ApiDeps extends Modules {
  readonly clock: Clock;
  readonly log: Logger;
  /** The web app's origin: the only `Origin` a cookie-bearing write may come from. */
  readonly appOrigin: string;
  /** Vercel Cron's bearer secret for maintenance routes. Unset = those routes always answer 401. */
  readonly cronSecret: string | undefined;
}
