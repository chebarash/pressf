import { timingSafeEqual } from "node:crypto";
import { nightlySync } from "@/lib/mentions";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET ?? ""}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (!env().CRON_SECRET || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return new Response(null, { status: 401 });
  }
  return Response.json(await nightlySync());
}
