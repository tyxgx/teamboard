import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

const pending = new Map<string, Promise<AxiosResponse>>();

/**
 * axios.get that shares one network call between callers who ask for the same URL at the same
 * time. Opening a board used to fire the board and message fetches three times in parallel from
 * different effects. Only in-flight requests are shared (nothing is cached), so callers never
 * see stale data. Treat the returned response as read-only.
 */
export const getShared = <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
  const auth = (config?.headers as Record<string, string> | undefined)?.Authorization ?? "";
  const key = `${auth}|${url}`;
  const existing = pending.get(key);
  if (existing) return existing as Promise<AxiosResponse<T>>;
  const request = axios.get<T>(url, config).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
};
