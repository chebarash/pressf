import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import * as views from "@/server/views";
import { demo, demoOf } from "@/screens/mobile/load";
import Uploads from "@/screens/mobile/Uploads";

export const metadata = { title: "My uploads" };
type Query = Promise<Record<string, string | string[] | undefined>>;

/** No desktop design for My uploads yet: both platforms render the mobile screen. */
export default async function Page({ searchParams }: { searchParams: Query }) {
  const [user, q] = await Promise.all([getUser(), searchParams]);
  const d = demoOf(q);
  if (!user && !d) redirect("/sign-in?next=/me/uploads");
  return <Uploads data={d ? demo.uploads() : await views.myUploads(user!.id)} />;
}
