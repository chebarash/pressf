import { getPlatform, isMobile } from "@/platform/server";
import { scheduleRefresh } from "@/server/sync/refresh";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export const mobile = async () => isMobile(await getPlatform());

/** The banner's Retry (?retry=1): refresh the LMS copy after the response; the next visit shows it. */
export function retry(userId: string | null | undefined, sp: Record<string, string | string[] | undefined>) {
  if (userId && one(sp.retry) === "1") scheduleRefresh(userId);
}
