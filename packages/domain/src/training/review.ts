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

export const isCalendarDay = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
