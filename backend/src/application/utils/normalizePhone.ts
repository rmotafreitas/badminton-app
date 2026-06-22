/**
 * Normalizes a phone number into a canonical form for storage and lookup.
 * Trims surrounding whitespace, removes internal spaces and separators
 * (e.g. "(", ")", "-", "."), and preserves a leading "+" country-code prefix.
 *
 *   "+351 967 083 100"   -> "+351967083100"
 *   "  +351967083100  "  -> "+351967083100"
 *   "(351) 967-083100"   -> "351967083100"
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}
