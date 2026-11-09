/** Locale-aware formatting helpers (the app speaks pt-PT and en-US). */
export const formatDate = (iso: string | Date, lang: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(iso).toLocaleDateString(lang, options);

export const formatShortDate = (iso: string | Date, lang: string) => {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(lang, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
};

/** Monday of the week `date` falls in (weeks start on Monday in Portugal), at local midnight. */
export const startOfWeek = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));

/** Today as YYYY-MM-DD in the user's own timezone (training days are calendar days, not UTC instants). */
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
