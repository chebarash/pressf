import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { harvestAll } from "@/lib/lms/harvest";

/** Harvests the LMS catalog and curricula into our tables. Long-running; guarded by CRON_SECRET. */
export async function POST(request: Request) {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET ?? ""}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (!env().CRON_SECRET || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return new Response(null, { status: 401 });
  }
  const result = await harvestAll();
  return Response.json(result, { status: "error" in result ? 503 : 200 });
}
