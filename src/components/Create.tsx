"use client";

import { createCourse } from "@/lib/course";
import { createProfessor } from "@/lib/professor";
import { CourseType } from "@/types/types";
import { useRef, useState } from "react";
import styles from "@/styles/Form.module.css";
import Course from "./Course";
import Input from "./Input";
import { signIn, useSession } from "next-auth/react";
import Modal from "./Modal";

export default function Create({ courses }: { courses: CourseType[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const ref2 = useRef<HTMLFormElement>(null);
  const [selectedCourses, setCourses] = useState<string[]>([]);
  const { data: session } = useSession();

  if (!session)
    return (
      <Modal title="Admin" onClose={() => {}}>
        <p>Sign in to create a professor or course</p>
        <button className={styles.signin} onClick={() => signIn("google")}>
          Sign in with Google
          <svg width="12" viewBox="0 0 13 21" fill="none">
            <path
              d="M2 18.5L10 10.5L2 2.5"
              stroke="var(--background)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </Modal>
    );

  if (session.user.email != process.env.NEXT_PUBLIC_ADMIN_EMAIL)
    return <div>Only admin can create professors and courses</div>;

  return (
    <>
      <form
        className={styles.form}
        ref={ref}
        action={async (FormData) => {
          ref.current?.reset();
          setCourses([]);
          await createProfessor(FormData);
        }}
      >
        <section>
          <h1>Add professor</h1>
          <p className={styles.required}>* Indicates required question</p>
        </section>
        <section>
          <h3 className={styles.star}>Name</h3>
          <Input
            name="name"
            type="text"
            placeholder="Name Surname"
            required
            style={{ width: `100%` }}
          />
        </section>
        <section>
          <h3>Image</h3>
          <Input
            name="image"
            type="file"
            accept="image/*"
            style={{ width: `100%` }}
          />
        </section>
        <section>
          <h3 className={styles.star}>Email</h3>
          <Input
            name="email"
            type="email"
            placeholder="n.surname@newuu.uz"
            required
            style={{ width: `100%` }}
          />
        </section>
        <section>
          <h3 className={styles.star}>Info</h3>
          <Input
            name="info"
            type="text"
            required
            style={{ width: `100%` }}
            placeholder="Short info"
          />
        </section>
        <section>
          <h3 className={styles.star}>Courses</h3>
          <div>
            {courses.map(({ id, name }) => (
              <label key={id}>
                <input
                  required={selectedCourses.length === 0}
                  type="checkbox"
                  name="courses"
                  value={id}
                  checked={selectedCourses.includes(id)}
                  onChange={(event) => {
                    if (event.target.checked)
                      setCourses([...selectedCourses, id]);
                    else
                      setCourses(
                        selectedCourses.filter((course) => course !== id)
                      );
                  }}
                />
                <Course
                  id={id}
                  name={name}
                  selected={selectedCourses.includes(id)}
                  onClick={() => {
                    if (selectedCourses.includes(id))
                      setCourses(
                        selectedCourses.filter((course) => course !== id)
                      );
                    else setCourses([...selectedCourses, id]);
                  }}
                />
              </label>
            ))}
          </div>
        </section>
        <button type="submit">
          Submit
          <svg width="12" viewBox="0 0 13 21" fill="none">
            <path
              d="M2 18.5L10 10.5L2 2.5"
              stroke="var(--foreground)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </form>
      <form
        ref={ref2}
        className={styles.form}
        action={async (FormData) => {
          ref2.current?.reset();
          // await createCourse(FormData);
          await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/courses`, {
            method: `POST`,
            body: JSON.stringify({
              name: FormData.get("name"),
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });
        }}
      >
        <section>
          <h1>Add course</h1>
          <p className={styles.required}>* Indicates required question</p>
        </section>
        <section>
          <h3 className={styles.star}>Name</h3>
          <Input
            name="name"
            type="text"
            required
            placeholder="Course name"
            style={{ width: `100%` }}
          />
        </section>
        <button type="submit">Submit</button>
      </form>
    </>
  );
}
