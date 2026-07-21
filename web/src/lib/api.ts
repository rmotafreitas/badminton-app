import axios, { AxiosError } from "axios";
import type { AxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 10_000,
  withCredentials: true, // send/receive httpOnly cookies on every request
});

/* ── Retry on timeout / network errors (cold-start resilience) ─────────── */

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 500;

/** Track retry count per request config. */
interface RetryConfig extends AxiosRequestConfig {
  __retryCount?: number;
}

/** Only retry idempotent requests (GET, HEAD, OPTIONS) on timeout/network errors. */
function isRetryable(config: RetryConfig): boolean {
  const method = (config.method ?? "get").toLowerCase();
  return ["get", "head", "options"].includes(method);
}

function isTimeoutError(error: AxiosError): boolean {
  return (
    error.code === "ECONNABORTED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ERR_NETWORK" ||
    error.message === "Network Error"
  );
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;

    // Only retry once, only on timeout/network errors, only for idempotent requests.
    if (
      !config ||
      !isRetryable(config) ||
      !isTimeoutError(error) ||
      (config.__retryCount ?? 0) >= MAX_RETRIES
    ) {
      return Promise.reject(error);
    }

    config.__retryCount = (config.__retryCount ?? 0) + 1;

    // Small delay before retrying — gives the backend time to wake up.
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

    return api.request(config);
  },
);

export default api;
