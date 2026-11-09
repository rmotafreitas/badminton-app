/**
 * Canonical phone form used for storage and lookups: digits only, keeping a leading "+".
 *   "+351 967 083 100" -> "+351967083100",  "(351) 967-083100" -> "351967083100"
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export const normalizeEmail = (email: string | null | undefined): string => (email ?? "").trim().toLowerCase();

export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
