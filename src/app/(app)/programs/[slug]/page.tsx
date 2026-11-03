import { redirect } from "next/navigation";

/** A program's page is its curriculum. */
export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/programs/${encodeURIComponent(slug)}/curriculum`);
}
