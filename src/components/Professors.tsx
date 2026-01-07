"use client";

import { CourseType, ProfessorType } from "@/types/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/styles/Professors.module.css";
import Input from "./Input";
import Course from "./Course";
import Modal from "./Modal";
import ProfileImage from "./ProfileImage";

const Arrow = ({
  name,
  selected,
  onClick,
}: {
  name: string;
  selected?: boolean;
  onClick: () => void;
}) => (
  <div className={[styles.arrow, selected ? styles.selected : ``].join(` `)}>
    <button onClick={onClick}>
      <p>{name}</p>
      <svg width="28" height="28" viewBox="0 0 40 41" fill="none">
        <path
          d="M12 17.5L20 25.5L28 17.5"
          stroke="var(--background)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </button>
  </div>
);

const Courses = ({
  filter,
  onClick,
}: {
  filter: string;
  onClick: () => void;
}) => (
  <div
    className={[
      styles.arrow,
      styles.courses,
      filter.length ? styles.selected : ``,
    ].join(` `)}
  >
    <button onClick={onClick}>
      <p>{filter || "Courses"}</p>
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
        <path
          d="M28 12L12 28M28 28L12 12"
          stroke="#F5F0D6"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  </div>
);

const levenshtein = (a: string, b: string) => {
  const matrix = Array.from({ length: b.length + 1 }, () =>
    Array(a.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
};

const fuzzySubstringMatch = (text: string, query: string) => {
  const t = (text || "").toLowerCase().trim();
  const q = (query || "").toLowerCase().trim();

  if (!q) return true;
  if (t.includes(q)) return true;

  if (q.length > t.length) {
    const maxDistance = Math.max(1, Math.floor(q.length / 3));
    return levenshtein(t, q) <= maxDistance;
  }

  const maxDistance = Math.max(1, Math.floor(q.length / 3));
  let best = Infinity;

  for (let i = 0; i <= t.length - q.length; i++) {
    const window = t.slice(i, i + q.length);
    const d = levenshtein(window, q);
    if (d < best) best = d;

    if (best <= maxDistance) return true;
  }

  return best <= maxDistance;
};

export default function Professors({
  professors,
  courses,
}: {
  professors: ProfessorType[];
  courses: CourseType[];
}) {
  const [modal, setModal] = useState<boolean>(false);

  const [search, setSearch] = useState<string>("");
  const [ratingAscending, setRatingAscending] = useState<boolean>(false);
  const [nameAscending, setNameAscending] = useState<boolean>(false);
  const [lastFilter, setLastFilter] = useState<`rating` | `name`>(`rating`);
  const [courseFilter, setCourseFilter] = useState<string>("");

  const [sortedProfessors, setSortedProfessors] = useState<
    (ProfessorType & { unvisible?: boolean })[]
  >([]);

  useEffect(() => {
    const filteredProfessors = professors.map((professor) => {
      const matchesCourse =
        !courseFilter.length ||
        professor.courses.some(({ name }) => name === courseFilter);

      const matchesName = fuzzySubstringMatch(professor.name, search);

      return {
        ...professor,
        unvisible: !(matchesCourse && matchesName),
      };
    });

    if (lastFilter === `rating`)
      filteredProfessors.sort((a, b) =>
        ratingAscending
          ? a.rating.overall - b.rating.overall
          : b.rating.overall - a.rating.overall
      );
    else if (lastFilter === `name`)
      filteredProfessors.sort((a, b) =>
        nameAscending
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name)
      );

    setSortedProfessors(filteredProfessors);
  }, [
    search,
    ratingAscending,
    nameAscending,
    courseFilter,
    lastFilter,
    professors,
  ]);

  return (
    <section className={styles.professors}>
      {modal && (
        <Modal title="Choose course" onClose={() => setModal(false)}>
          <div className={[styles.coursesBox, styles.modalCourses].join(` `)}>
            {courses
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(({ id, name, code }) => (
                <Course
                  key={id}
                  id={id}
                  name={name}
                  code={code}
                  onClick={() => {
                    setCourseFilter(name);
                    setModal(false);
                  }}
                />
              ))}
          </div>
        </Modal>
      )}
      <Input
        type="text"
        id="search"
        name="search"
        placeholder="Enter the professor's name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className={styles.table}>
        <Arrow
          name="Rating"
          selected={ratingAscending}
          onClick={() => {
            setRatingAscending(!ratingAscending);
            setLastFilter(`rating`);
          }}
        />
        <Arrow
          name="Name"
          selected={nameAscending}
          onClick={() => {
            setNameAscending(!nameAscending);
            setLastFilter(`name`);
          }}
        />
        <Courses
          filter={courseFilter}
          onClick={() =>
            courseFilter.length ? setCourseFilter("") : setModal(true)
          }
        />
        {sortedProfessors.flatMap(
          ({ id, image, name, rating, courses, unvisible }) => [
            <h2
              className={unvisible ? styles.unvisible : ``}
              key={`${id}-rating`}
            >
              {rating.overall.toFixed(1)}
            </h2>,
            <span
              key={`${id}-pfp`}
              className={unvisible ? styles.unvisible : ``}
            >
              <ProfileImage image={image} name={name} />
            </span>,
            <h3
              className={unvisible ? styles.unvisible : ``}
              key={`${id}-name`}
            >
              <Link prefetch href={`professors/${id}`}>
                {name}
              </Link>
            </h3>,
            <div
              className={[
                styles.coursesBox,
                unvisible ? styles.unvisible : ``,
              ].join(` `)}
              key={`${id}-courses`}
            >
              {courses.map((course) => (
                <Course
                  key={course.id}
                  {...course}
                  selected={courseFilter === course.name}
                  onClick={() =>
                    setCourseFilter((old) =>
                      old == course.name ? `` : course.name
                    )
                  }
                />
              ))}
            </div>,
          ]
        )}
      </div>
    </section>
  );
}
