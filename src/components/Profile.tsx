"use client";

import { ProfessorType } from "@/types/types";
import Image from "next/image";
import styles from "@/styles/Profile.module.css";
import Course from "./Course";

export default function Profile({
  image,
  name,
  email,
  courses,
  rating,
  info,
}: ProfessorType) {
  return (
    <div className={styles.profile}>
      <div className={styles.image}>
        <div>
          <Image src={image || `/pfp.png`} alt={name} fill />
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
            <Course key={course.id} {...course} onClick={() => true} />
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
