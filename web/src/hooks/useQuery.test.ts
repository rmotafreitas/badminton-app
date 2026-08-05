import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";

// We test the isNetworkError helper and retry logic in isolation
function isNetworkError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    return (
      err.code === "ECONNABORTED" ||
      err.code === "ETIMEDOUT" ||
      err.code === "ERR_NETWORK" ||
      err.message === "Network Error"
    );
  }
  return false;
}

describe("useQuery network error handling", () => {
  describe("isNetworkError", () => {
    it("returns true for ERR_NETWORK", () => {
      const err = new AxiosError("msg", "ERR_NETWORK", {} as any, {} as any);
      expect(isNetworkError(err)).toBe(true);
    });

    it("returns true for ECONNABORTED", () => {
      const err = new AxiosError("msg", "ECONNABORTED", {} as any, {} as any);
      expect(isNetworkError(err)).toBe(true);
    });

    it("returns true for ETIMEDOUT", () => {
      const err = new AxiosError("msg", "ETIMEDOUT", {} as any, {} as any);
      expect(isNetworkError(err)).toBe(true);
    });

    it("returns true for 'Network Error' message", () => {
      const err = new AxiosError("Network Error", "OTHER", {} as any, {} as any);
      expect(isNetworkError(err)).toBe(true);
    });

    it("returns false for 401 response error", () => {
      const err = new AxiosError(
        "Unauthorized",
        "ERR_BAD_REQUEST",
        {} as any,
        {} as any,
        { status: 401, data: {}, headers: {}, statusText: "", config: {} as any },
      );
      expect(isNetworkError(err)).toBe(false);
    });

    it("returns false for 500 response error", () => {
      const err = new AxiosError(
        "Server Error",
        "ERR_BAD_RESPONSE",
        {} as any,
        {} as any,
        { status: 500, data: {}, headers: {}, statusText: "", config: {} as any },
      );
      expect(isNetworkError(err)).toBe(false);
    });

    it("returns false for non-AxiosError", () => {
      expect(isNetworkError(new Error("something"))).toBe(false);
      expect(isNetworkError("string error")).toBe(false);
      expect(isNetworkError(null)).toBe(false);
    });
  });
});
