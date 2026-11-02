import { redirect } from "next/navigation";

/** /programs → the student's own curriculum (or the best cohort plan for guests). */
export default function ProgramsPage() {
  redirect("/programs/mine/curriculum");
}
