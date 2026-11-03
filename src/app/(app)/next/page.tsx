import { redirect } from "next/navigation";

/** "Next semester" was removed; the curriculum covers what's ahead. */
export default function NextSemester() {
  redirect("/programs/mine/curriculum");
}
