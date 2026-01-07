"use client";

import { FeedbackType } from "@/types/types";
import Course from "./Course";
import styles from "@/styles/Feedback.module.css";

export default function Feedback({
  rating,
  author,
  updatedAt,
  courses,
  text,
  courseFilter,
  setCourseFilter,
}: FeedbackType & {
  courseFilter: string;
  setCourseFilter: (course: string) => void;
}) {
  return (
    <li
      className={[
        styles.feedback,
        courseFilter == `` || courses.some(({ id }) => id == courseFilter)
          ? ``
          : styles.hidden,
      ].join(` `)}
    >
      <h1>{rating.overall.toFixed(1)}</h1>
      <div className={styles.author}>
        <p>{typeof author == `string` ? author : ``}</p>
        <div>
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
      </div>
      <p className={styles.text}>
        {text}
        <br />
        {rating.clarity.toFixed(1)} Clearity, {rating.engagement.toFixed(1)}{" "}
        Engagement, {rating.organization.toFixed(1)} Organization,{" "}
        {rating.expertise.toFixed(1)} Expertise, {rating.fairGrading.toFixed(1)}{" "}
        Fair Grading
      </p>
      <p className={styles.date}>
        {new Date(updatedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
    </li>
  );
}
