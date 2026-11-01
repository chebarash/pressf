import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";

/** Signed-in students keep the group on their account, others in a cookie. */
export async function currentGroup() {
  const user = await getUser();
  return user?.group ?? (await cookies()).get("group")?.value ?? null;
}
