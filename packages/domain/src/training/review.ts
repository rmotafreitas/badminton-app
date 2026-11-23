export interface TrainingReview {
  readonly id: string;
  readonly userId: string;
  /** Calendar day, YYYY-MM-DD (the player's local day). */
  readonly date: string;
  /** 1 (easy) to 10 (maximal). */
  readonly effort: number;
  readonly note: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const isCalendarDay = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Date.parse rolls "2026-02-31" over to March 3rd: a real day reads back the same.
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
};
