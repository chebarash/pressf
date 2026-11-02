import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Schools from "@/screens/mobile/Schools";
import { schools } from "@/server/views";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ slug }, data] = await Promise.all([params, schools()]);
  return { title: data.schools.find((k) => k.id === slug)?.name ?? "School" };
}

/** A school's programs, each opening its curriculum. Same screen on desktop for now. */
export default async function SchoolPage({ params }: { params: Params }) {
  const [{ slug }, data] = await Promise.all([params, schools()]);
  if (!data.schools.some((k) => k.id === slug)) notFound();
  return <Schools data={data} schoolId={slug} />;
}
