import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { harvestCatalog } from "@/lib/lms/harvest";
import { harvestSession } from "@/lib/lms/store";

/** Harvests the LMS catalog into our tables. Long-running; guarded by CRON_SECRET. */
export async function POST(request: Request) {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET ?? ""}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (!env().CRON_SECRET || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return new Response(null, { status: 401 });
  }
  const session = await harvestSession();
  if (!session) return Response.json({ error: "no_lms_account" }, { status: 503 });
  return Response.json(await harvestCatalog(session));
}
