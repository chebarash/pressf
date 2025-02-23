"use client";

import { CourseType, ProfessorType } from "@/types/types";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/styles/Professors.module.css";
import Input from "./Input";
import Course from "./Course";
import Modal from "./Modal";

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
      <p>Courses</p>
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
  const [courseFilter, setCourseFilter] = useState<string>("");

  const [sortedProfessors, setSortedProfessors] = useState<
    (ProfessorType & { unvisible?: boolean })[]
  >([]);

  useEffect(() => {
    const filteredProfessors = professors.map((professor) => ({
      ...professor,
      unvisible:
        !(
          !courseFilter.length ||
          professor.courses.some(({ name }) => name === courseFilter)
        ) || !professor.name.toLowerCase().includes(search.toLowerCase()),
    }));

    filteredProfessors.sort((a, b) =>
      ratingAscending ? a.rating - b.rating : b.rating - a.rating
    );
    filteredProfessors.sort((a, b) =>
      nameAscending
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );
    setSortedProfessors(filteredProfessors);
  }, [search, ratingAscending, nameAscending, courseFilter, professors]);

  return (
    <section className={styles.professors}>
      {modal && (
        <Modal title="Choose course" onClose={() => setModal(false)}>
          <div className={[styles.coursesBox, styles.modalCourses].join(` `)}>
            {courses.map(({ id, name }) => (
              <Course
                key={id}
                id={id}
                name={name}
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
          onClick={() => setRatingAscending(!ratingAscending)}
        />
        <Arrow
          name="Name"
          selected={nameAscending}
          onClick={() => setNameAscending(!nameAscending)}
        />
        <Courses
          filter={courseFilter}
          onClick={() =>
            courseFilter.length ? setCourseFilter("") : setModal(true)
          }
        />
        {sortedProfessors.flatMap(
          ({ id, name, rating, image, courses, unvisible }) => [
            <h2
              className={unvisible ? styles.unvisible : ``}
              key={`${id}-rating`}
            >
              {rating.toFixed(1)}
            </h2>,
            <span
              key={`${id}-pfp`}
              className={unvisible ? styles.unvisible : ``}
            >
              <Image
                src={image || "/pfp.png"}
                alt={name}
                width={100}
                height={100}
              />
            </span>,
            <h3
              className={unvisible ? styles.unvisible : ``}
              key={`${id}-name`}
            >
              <Link href={`professors/${id}`}>{name}</Link>
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
