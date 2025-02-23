import Professors from "@/components/Professors";
import { getProfessors } from "@/lib/professor";
import Temp from "@/components/Temp";
import Header from "@/components/Header";

export default async function Home() {
  const { professors, courses } = await getProfessors();
  return (
    <main>
      <Header />
      {professors && courses ? (
        <Professors professors={professors} courses={courses} />
      ) : (
        <div>Error loading professors</div>
      )}
    </main>
  );
}
