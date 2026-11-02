import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopProfessor from "@/screens/desktop/Professor";
import { mobile } from "@/screens/mobile/mc/route";
import Professor from "@/screens/mobile/Professor";
import { professorMetadata } from "@/server/og";
import { professor } from "@/server/views";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return professorMetadata(decodeURIComponent((await params).id));
}

export default async function ProfessorPage({ params }: { params: Params }) {
  const [{ id }, user, isMobile] = await Promise.all([params, getUser(), mobile()]);
  const data = await professor(decodeURIComponent(id), user ? { userId: user.id } : null);
  if (!data) notFound();
  return isMobile ? <Professor data={data} /> : <DesktopProfessor data={data} />;
}
