/**
 * Normalize a string for search: lowercase, remove accents, trim, collapse spaces.
 */
export function normalizeSearch(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validate a badminton score according to standard rules.
 * Returns null if valid, or an i18n error key if invalid.
 *
 * Rules: win by 2, hard cap at 30 (30-29 is valid), minimum score 7.
 * Does NOT enforce a specific target (7/11/15/21) — auto-detects.
 */
export type ScoreError = "scoreDraw" | "scoreNeg" | "scoreMax30" | "scoreWinBy2" | "scoreTooLow";

export function checkScore(a: number, b: number): ScoreError | null {
  if (a < 0 || b < 0) return "scoreNeg";
  if (a > 30 || b > 30) return "scoreMax30";
  if (a === 0 && b === 0) return null; // not entered yet
  if (a === b) return "scoreDraw";

  const winner = Math.max(a, b);
  const loser = Math.min(a, b);

  // Capped at 30 — 30-29 and 30-28 are both valid
  if (winner === 30 && loser >= 28) return null;

  // Must win by at least 2
  if (winner - loser < 2) return "scoreWinBy2";

  // Winner must have at least 5 points
  if (winner < 5) return "scoreTooLow";

  return null;
}
