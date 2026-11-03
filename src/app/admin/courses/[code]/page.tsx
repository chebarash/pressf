import { notFound } from "next/navigation";
import { CourseFiles } from "@/screens/admin/CourseFiles";
import { requireSection } from "@/server/admin/viewer";
import { courseFiles } from "@/server/admin/views";

export default async function AdminCourseFilesPage({ params }: { params: Promise<{ code: string }> }) {
  await requireSection("courses");
  const data = await courseFiles(decodeURIComponent((await params).code));
  if (!data) notFound();
  return <CourseFiles data={data} />;
}
