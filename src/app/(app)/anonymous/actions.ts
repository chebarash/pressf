"use server";

import { mentionsOf, MENTIONS_PAGE, type MentionView } from "@/server/views/shared";

/** The next page of Anonymous posts that mention a course or a professor (public, like the pages). */
export async function moreMentions(kind: "course" | "teacher", target: string, offset: number): Promise<MentionView[]> {
  if ((kind !== "course" && kind !== "teacher") || typeof target !== "string" || !/^[\w-]{1,40}$/.test(target)) return [];
  const from = Math.max(0, Math.min(Math.floor(Number(offset) || 0), 100_000));
  return (await mentionsOf(kind, target, MENTIONS_PAGE, from)).latest;
}
