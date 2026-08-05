import axios, { AxiosError } from "axios";
import type { InternalAxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 10_000,
  withCredentials: true, // send/receive httpOnly cookies on every request
});

/* ── Retry on timeout / network errors (cold-start resilience) ─────────── */

const MAX_RETRIES = 3;
const RETRY_BACKOFF = [500, 2000, 6000];

/** Track retry count per request config. */
export interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
  __skipRefresh?: boolean;
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

/* ── 401 refresh flow ─────────────────────────────────────────────────── */

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(undefined);
    }
  });
  failedQueue = [];
}

export function createErrorHandler(opts?: {
  request?: (config: RetryConfig) => Promise<unknown>;
  refresh?: () => Promise<unknown>;
}) {
  const requestFn = opts?.request ?? ((config) => api.request(config));
  const refreshFn = opts?.refresh ?? (() => api.post("/auth/refresh", undefined, {
    __skipRefresh: true,
  } as RetryConfig));

  return async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;

    if (!config || config.__skipRefresh) {
      if (
        config &&
        !config.__skipRefresh &&
        isRetryable(config) &&
        isTimeoutError(error) &&
        (config.__retryCount ?? 0) < MAX_RETRIES
      ) {
        config.__retryCount = (config.__retryCount ?? 0) + 1;
        const delay = RETRY_BACKOFF[(config.__retryCount ?? 1) - 1]!;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return requestFn(config);
      }
      return Promise.reject(error);
    }

    if (error.response?.status !== 401) {
      if (
        isRetryable(config) &&
        isTimeoutError(error) &&
        (config.__retryCount ?? 0) < MAX_RETRIES
      ) {
        config.__retryCount = (config.__retryCount ?? 0) + 1;
        const delay = RETRY_BACKOFF[(config.__retryCount ?? 1) - 1]!;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return requestFn(config);
      }
      return Promise.reject(error);
    }

    const url = config.url ?? "";
    if (
      url.includes("/auth/refresh") ||
      url.includes("/auth/complete") ||
      url.includes("/auth/logout")
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(() => requestFn({ ...config, __skipRefresh: true } as RetryConfig))
        .catch(() => Promise.reject(error));
    }

    isRefreshing = true;

    try {
      await refreshFn();
      isRefreshing = false;
      processQueue(null);
      return requestFn({ ...config, __skipRefresh: true } as RetryConfig);
    } catch (refreshError) {
      isRefreshing = false;
      processQueue(refreshError);
      return Promise.reject(refreshError);
    }
  };
}

// ── Reset state between tests ────────────────────────────────────────────

export function _resetRefreshState() {
  isRefreshing = false;
  failedQueue = [];
}

// ── Register the real interceptor ────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  createErrorHandler(),
);

export default api;
