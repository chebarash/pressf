import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { BottomBar } from "@/ui/shell/BottomBar";
import { FirstSync } from "@/ui/shell/FirstSync";

export const metadata = { title: "Setting up", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function Setup({ searchParams }: Props) {
  const [{ next }, user] = await Promise.all([searchParams, getUser()]);
  if (!user) redirect("/sign-in");
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="sh-auth-mobile">
      <FirstSync next={safe} />
      <BottomBar />
    </div>
  );
}
