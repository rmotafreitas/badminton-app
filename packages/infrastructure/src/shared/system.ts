import type { Clock, Logger } from "@bb/application";

export const systemClock: Clock = { now: () => new Date() };

/** One JSON line per event: readable in Vercel's log view and greppable locally. */
export function consoleLogger(base: Record<string, unknown> = {}): Logger {
  const write = (level: string, message: string, fields?: Record<string, unknown>) => {
    // biome-ignore lint/suspicious/noConsole: the logger is the one place that writes to the console
    console[level === "error" ? "error" : "log"](JSON.stringify({ level, message, ...base, ...fields, at: new Date().toISOString() }));
  };
  return {
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
  };
}
