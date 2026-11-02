import type { Metadata } from "next";
import Schools from "@/screens/mobile/Schools";
import { schools } from "@/server/views";

export const metadata: Metadata = { title: "Schools and programs" };

/** Same screen on desktop until it has its own design. */
export default async function SchoolsPage() {
  return <Schools data={await schools()} />;
}
