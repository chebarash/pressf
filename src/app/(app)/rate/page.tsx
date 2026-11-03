import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import { rateMetadata } from "@/server/og";
import Desktop from "@/screens/desktop/Rate";
import { submitRating } from "./actions";
import { demo, demoOf, loadRate, rateScreen } from "@/screens/mobile/load";
import Mobile from "@/screens/mobile/Rate";

export const generateMetadata = () => rateMetadata();
type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Query }) {
  const [platform, user, q] = await Promise.all([getPlatform(), getUser(), searchParams]);
  const d = demoOf(q);
  if (!user && !d) redirect("/sign-in?next=/rate");
  const view = d ? rateScreen(demo.rate()) : await loadRate(user!.id);
  if (!view) redirect("/sign-in?next=/rate");
  const data = { ...view, notice: q.sent ? ("rating-sent" as const) : null };
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} actions={{ submit: submitRating }} />;
}
