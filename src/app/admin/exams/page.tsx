import { Exams } from "@/screens/admin/Exams";
import { requireSection } from "@/server/admin/viewer";
import { examsAdmin } from "@/server/exams";

export default async function AdminExamsPage() {
  await requireSection("exams");
  return <Exams data={await examsAdmin()} />;
}
