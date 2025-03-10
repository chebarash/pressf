import Create from "@/components/Create";
import { getCourses } from "@/lib/course";
import Link from "next/link";

export default async function Admin() {
  const { courses } = await getCourses();

  if (!courses) return <div>Error loading courses</div>;

  return (
    <>
      <header>
        <h3>
          <Link prefetch href="/">
            Press F
          </Link>
        </h3>
      </header>
      <main>
        <Create courses={courses} />
      </main>
    </>
  );
}
