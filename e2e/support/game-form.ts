import type { Locator, Page } from "@playwright/test";

/**
 * Drives the tap-only game form: player slots open a player sheet, scores open a number grid. Nothing is typed,
 * which is the point: it's used one-handed, between rallies.
 */
export function gameForm(page: Page, form: Locator) {
  const picker = () => page.getByRole("dialog", { name: /score/ });
  return {
    /** Taps a player slot ("Team 1 1", "Team 2 2", …) and picks someone from the sheet. */
    async player(slot: string, name: string) {
      await form.getByRole("button", { name: slot, exact: true }).click();
      await page.getByRole("option", { name: new RegExp(name) }).click();
    },
    /** One score: taps the score button ("Team 1 Score", "Team 2 Set 2") and a number on the grid. */
    async score(label: string, value: number) {
      await form.getByRole("button", { name: label, exact: true }).click();
      await picker().getByRole("button", { name: String(value), exact: true }).click();
    },
    /**
     * Both scores of a row on an empty row: picking team 1's moves straight on to team 2's.
     * `row` is "Score" for a single score, "Set 2" once there are sets.
     */
    async row(row: string, a: number, b: number) {
      await form.getByRole("button", { name: `Team 1 ${row}`, exact: true }).click();
      await picker().getByRole("button", { name: String(a), exact: true }).click();
      await page.getByRole("dialog", { name: "Team 2 score" }).getByRole("button", { name: String(b), exact: true }).click();
      await picker().waitFor({ state: "hidden" });
    },
  };
}
