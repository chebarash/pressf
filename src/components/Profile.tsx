"use client";

import { ProfessorType } from "@/types/types";
import styles from "@/styles/Profile.module.css";
import Course from "./Course";
import ProfileImage from "./ProfileImage";

export default function Profile({
  image,
  name,
  email,
  courses,
  rating,
  info,
  courseFilter,
  setCourseFilter,
}: ProfessorType & {
  courseFilter: string;
  setCourseFilter: (course: string) => void;
}) {
  return (
    <div className={styles.profile}>
      <div className={styles.image}>
        <div>
          <ProfileImage image={image} name={name} fill />
        </div>
      </div>
      <section className={styles.info}>
        <h1>{name}</h1>
        <a href={`mailto:${email}`}>{email}</a>
        <span>
          <h1>{rating.toFixed(1)}</h1>
          <p>average rating</p>
        </span>
      </section>
      <section>
        <h2>Courses</h2>
        <div className={styles.coursesBox}>
          {courses.map((course) => (
            <Course
              key={course.id}
              {...course}
              selected={courseFilter === course.id}
              onClick={() =>
                setCourseFilter(course.id === courseFilter ? `` : course.id)
              }
            />
          ))}
        </div>
      </section>
      <section>
        <h2>Info</h2>
        <p>{info}</p>
      </section>
    </div>
  );
}
