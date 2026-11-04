"use server";

import { getUser } from "@/lib/auth";
import { dismissHint } from "@/server/hints";

/** × on a "first time here" hint, or its action used: never shown again, on any device. */
export async function dismissHintAction(id: string): Promise<boolean> {
  const user = await getUser();
  if (!user || typeof id !== "string") return false;
  return dismissHint(user.id, id);
}
