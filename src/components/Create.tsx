"use client";

import { createCourse } from "@/lib/course";
import { createProfessor } from "@/lib/professor";
import { CourseType } from "@/types/types";
import { useRef } from "react";

export default function Crate({ courses }: { courses: CourseType[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const ref2 = useRef<HTMLFormElement>(null);
  return (
    <div>
      <form
        ref={ref}
        action={async (FormData) => {
          ref.current?.reset();
          await createProfessor(FormData);
        }}
      >
        <label htmlFor="name">Name</label>
        <input type="text" name="name" />
        <label htmlFor="email">Email</label>
        <input type="email" name="email" />
        <label htmlFor="info">Info</label>
        <input type="text" name="info" />
        <label htmlFor="courses">Courses</label>
        {courses.map(({ id, name }) => (
          <div key={id}>
            <input type="checkbox" name="courses" value={id} />
            <label>{name}</label>
          </div>
        ))}
        <button type="submit">Submit</button>
      </form>
      <form
        ref={ref2}
        action={async (FormData) => {
          ref2.current?.reset();
          await createCourse(FormData);
        }}
      >
        <label htmlFor="name">Name</label>
        <input type="text" name="name" />
        <label htmlFor="code">Code</label>
        <input type="text" name="code" />
        <button type="submit">Submit</button>
      </form>
    </div>
  );
}
