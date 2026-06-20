import { describe, it, expect } from "bun:test";
import { createUnauthedApi } from "../helpers";

describe("Health", () => {
  const api = createUnauthedApi();

  it("GET /health returns 200 with status ok", async () => {
    const { data, status } = await api.health.get();
    expect(status).toBe(200);
    expect(data).toBeObject();
    expect(data!.status).toBe("ok");
    expect(data!.ts).toBeTruthy();
    expect(data!.ts instanceof Date || typeof data!.ts === "string").toBe(true);
  });

  it("GET /health ts is a valid date", async () => {
    const { data } = await api.health.get();
    const d = data!.ts instanceof Date ? data!.ts : new Date(data!.ts);
    expect(d.getTime()).not.toBeNaN();
  });
});
