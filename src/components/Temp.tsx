import { createProfessor, getProfessors } from "@/lib/professor";
import Crate from "./Create";
import { getCourses } from "@/lib/course";

export default async function Temp() {
  try {
    const professors = await getProfessors();
    const courses = await getCourses();
    console.log(professors, courses);
    return (
      <div>
        {Array.isArray(courses) ? (
          <Crate courses={courses} />
        ) : (
          <div>Error loading courses</div>
        )}
      </div>
    );
  } catch (error) {
    console.log(error);
  }
}
