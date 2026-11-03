import { redirect } from "next/navigation";

/** Old next-semester course links open the course. */
export default async function NextCourse({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/c/${encodeURIComponent(code)}`);
}
