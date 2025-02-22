"use client";

import { ProfessorType } from "@/types/types";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/styles/Professors.module.css";
import Input from "./Input";
import Course from "./Course";

const Arrow = ({
  name,
  selected,
  onClick,
}: {
  name: string;
  selected?: boolean;
  onClick: () => any;
}) => (
  <th className={[styles.arrow, selected ? styles.selected : ``].join(` `)}>
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
  </th>
);

const Modal = ({
  title,
  children,
  onClose,
}: {
  title: string;
  children: any;
  onClose: () => any;
}) => (
  <div
    className={styles.modal}
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div className={styles.content}>
      <h2>{title}</h2>
      {children}
    </div>
  </div>
);

const Courses = ({
  filter,
  onClick,
}: {
  filter: string;
  onClick: () => any;
}) => (
  <th
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
  </th>
);

export default function Professors({
  professors,
}: {
  professors: ProfessorType[];
}) {
  const [modal, setModal] = useState<boolean>(false);

  const [search, setSearch] = useState<string>("");
  const [ratingAscending, setRatingAscending] = useState<boolean>(false);
  const [nameAscending, setNameAscending] = useState<boolean>(false);
  const [courseFilter, setCourseFilter] = useState<string>("");

  const [sortedProfessors, setSortedProfessors] = useState<ProfessorType[]>([]);

  useEffect(() => {
    const filteredByCourse = courseFilter.length
      ? professors.filter(({ courses }) =>
          courses.some(({ name }) => courseFilter === name)
        )
      : professors;

    const filteredProfessors = filteredByCourse.filter(({ name }) =>
      name.toLowerCase().includes(search.toLowerCase())
    );

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
          {professors
            .flatMap(({ courses }) => courses)
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
      <table>
        <thead>
          <tr>
            <Arrow
              name="Rating"
              selected={ratingAscending}
              onClick={() => setRatingAscending(!ratingAscending)}
            />
            <th></th>
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
          </tr>
        </thead>
        <tbody>
          {sortedProfessors.map(({ id, name, rating, image, courses }) => (
            <tr key={id}>
              <td>{rating}</td>
              <td>
                <Image
                  src={image || "/pfp.png"}
                  alt={name}
                  width={50}
                  height={50}
                />
              </td>
              <td>
                <Link href={`professors/${id}`}>{name}</Link>
              </td>
              <td>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
