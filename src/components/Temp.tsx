import { createProfessor, getProfessors } from "@/lib/professor";
import Crate from "./Create";
import { getCourses } from "@/lib/course";
import Image from "next/image";

export default async function Temp() {
  try {
    const { professors } = await getProfessors();
    const { courses } = await getCourses();
    return (
      <div>
        {professors ? (
          professors.map(({ id, name, email, image, info, courses }) => (
            <div key={id}>
              <h2>{name}</h2>
              <p>{email}</p>
              <p>{info}</p>
              <Image
                src={image || `/pfp.png`}
                width={80}
                height={80}
                alt={name}
              />
              <ul>
                {courses.map(({ id, name }) => (
                  <li key={id}>{name}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div>Error loading professors</div>
        )}
        {courses ? (
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
