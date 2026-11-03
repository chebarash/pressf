import { getPlatform, isMobile } from "@/platform/server";
import { syncNowFor } from "@/server/sync/manual";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export const mobile = async () => isMobile(await getPlatform());

/**
 * The banner's Retry (?retry=1): one sync for the student before the page reads
 * its data, so the page that loads is the refreshed one (rate limited in
 * syncNowFor; the page waits while it runs, which is the feedback).
 */
export async function retry(userId: string | null | undefined, sp: Record<string, string | string[] | undefined>) {
  if (userId && one(sp.retry) === "1") await syncNowFor(userId).catch(() => null);
}
