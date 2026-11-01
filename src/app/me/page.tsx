import { redirect } from "next/navigation";
import { currentGroup } from "@/lib/group";

/** My semester is the home page now. This address stays for old links. */
export default async function Me() {
  redirect((await currentGroup()) ? "/" : "/me/group");
}
