"use client";

import { FeedbackType } from "@/types/types";
import Course from "./Course";
import styles from "@/styles/Feedback.module.css";

export default function Feedback({
  rate,
  author,
  updatedAt,
  courses,
  text,
}: FeedbackType) {
  console.log(rate, author, updatedAt, courses, text);
  return (
    <li className={styles.feedback}>
      <h1>{rate.toFixed(1)}</h1>
      <div className={styles.content}>
        <div className={styles.author}>
          <p>{typeof author == `string` ? author : ``}</p>
          <div>
            {courses.map((course) => (
              <Course key={course.id} {...course} onClick={() => {}} />
            ))}
          </div>
        </div>
        <p className={styles.text}>{text}</p>
        <p className={styles.date}>
          {new Date(updatedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </li>
  );
}
