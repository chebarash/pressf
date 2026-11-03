import type { Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import { fileMetadata } from "@/server/og";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/File";
import Mobile from "@/screens/mobile/File";
import { demo, demoOf } from "@/screens/mobile/load";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return fileMetadata((await params).id);
}
/** The file preview may be pinch-zoomed (the rest of the app stays at 1x, see the root layout). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", maximumScale: 5 };

type Query =Promise<Record<string, string | string[] | undefined>>;

/** Files are for signed-in students only (privacy rule): the view returns `locked` for guests. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Query }) {
  const [platform, user, { id }, q] = await Promise.all([getPlatform(), getUser(), params, searchParams]);
  const d = demoOf(q);
  const data = d ? demo.file(id) : await views.file(id, user ? { userId: user.id } : null);
  if (!data) notFound();
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} />;
}
