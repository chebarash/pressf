"use client";

import { ProfessorType } from "@/types/types";
import { useEffect, useRef, useState } from "react";
import styles from "@/styles/Form.module.css";
import Course from "./Course";
import { rateProfessor } from "@/lib/professor";
import Modal from "./Modal";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const formDataToUrl = (formData: FormData): string => {
  const params = new URLSearchParams();

  formData.forEach((value, key) => {
    params.append(key, value.toString());
  });

  return params.toString();
};

export default function Form({ courses, id }: ProfessorType) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [selectedCourses, setCourses] = useState<string[]>([]);
  const [rate, setRate] = useState<number>(0);
  const [text, setText] = useState<string>("");
  const [showModal, setShowModal] = useState<boolean>(false);
  const { data: session } = useSession();

  const searchParams = useSearchParams();

  useEffect(() => {
    const courses = searchParams.getAll("courses");
    const rate = searchParams.get("rate");
    const text = searchParams.get("text");
    if (courses.length < 1 || !rate || !session) return;
    const formData = new FormData();
    courses.forEach((course) => formData.append("courses", course));
    formData.append("rate", rate);
    formData.append("text", text || ``);
    formData.append(`professor`, id);
    rateProfessor(formData).then(() => {
      router.replace(`/professors/${id}`, {
        scroll: false,
      });
      ref.current?.reset();
      setCourses([]);
      setRate(0);
      setText("");
    });
  }, [id, router, searchParams, session, ref]);

  return (
    <>
      {showModal && (
        <Modal title="Sign in" onClose={() => setShowModal(false)}>
          <p>
            You need to sign in to leave a review. Don’t worry—your{" "}
            <b>review will be anonymous</b>, and your name will be{" "}
            <b>replaced with a randomly generated</b> one.
            <br />
            <br />
            Sign in needed only to prevent spam and ensure the quality of
            reviews.
          </p>
          <button className={styles.singin} onClick={() => signIn("google")}>
            Sign in with Google
          </button>
        </Modal>
      )}
      <form
        className={styles.form}
        ref={ref}
        action={async (FormData) => {
          if (!session) {
            router.replace(`/professors/${id}?${formDataToUrl(FormData)}`, {
              scroll: false,
            });
            return setShowModal(true);
          }
          ref.current?.reset();
          setCourses([]);
          setRate(0);
          setText("");
          FormData.append(`professor`, id);
          await rateProfessor(FormData);
        }}
      >
        <section>
          <h1>Share your experience!</h1>
          <p>
            Your feedback helps other students and improves the quality of
            teaching. Don’t worry—your review will be anonymous, and your name
            will be replaced with a randomly generated one.
          </p>
          <p className={styles.required}>* Indicates required question</p>
        </section>
        <section>
          <h3 className={styles.star}>Select courses taught</h3>
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
        <section>
          <h3 className={styles.star}>Rate</h3>
          <div>
            {[1, 2, 3, 4, 5].map((r) => (
              <label key={r}>
                <input
                  type="radio"
                  id={`rate${r}`}
                  name="rate"
                  value={r}
                  required
                  checked={r === rate}
                  onChange={() => setRate(r)}
                />
                <button
                  type="button"
                  onClick={() => setRate(r)}
                  className={[
                    styles.rate,
                    r <= rate ? styles.selected : "",
                  ].join(" ")}
                >
                  <svg width="60" height="60" viewBox="0 0 80 80" fill="none">
                    <path
                      d="M44.7553 9.16312C43.2585 4.55657 36.7415 4.55656 35.2447 9.16312L29.7909 25.9483C29.657 26.3604 29.273 26.6393 28.8398 26.6393H11.1908C6.34718 26.6393 4.33329 32.8374 8.25186 35.6844L22.5302 46.0582C22.8807 46.3129 23.0274 46.7643 22.8935 47.1763L17.4396 63.9615C15.9429 68.568 21.2153 72.3987 25.1339 69.5517L39.4122 59.1778C39.7627 58.9232 40.2373 58.9232 40.5878 59.1778L54.8661 69.5517C58.7847 72.3987 64.0571 68.5681 62.5604 63.9615L57.1065 47.1763C56.9726 46.7642 57.1193 46.3129 57.4698 46.0582L71.7481 35.6844C75.6667 32.8374 73.6528 26.6393 68.8092 26.6393H51.1602C50.727 26.6393 50.343 26.3604 50.2091 25.9483L44.7553 9.16312Z"
                      fill="var(--foreground)"
                      stroke="var(--foreground)"
                      strokeWidth="4"
                    />
                    <path
                      d="M37.1468 8.78115C38.0449 6.01722 41.9551 6.01722 42.8532 8.78115L48.307 25.5664C48.7086 26.8024 49.8605 27.6393 51.1602 27.6393H68.8092C71.7154 27.6393 72.9237 31.3582 70.5726 33.0664L56.2942 43.4402C55.2427 44.2041 54.8028 45.5582 55.2044 46.7943L60.6582 63.5795C61.5563 66.3435 58.3929 68.6418 56.0417 66.9336L41.7634 56.5598C40.7119 55.7959 39.2881 55.7959 38.2366 56.5598L23.9583 66.9336C21.6071 68.6418 18.4437 66.3435 19.3418 63.5795L24.7956 46.7943C25.1972 45.5582 24.7573 44.2041 23.7058 43.4402L9.42743 33.0664C7.07629 31.3582 8.28462 27.6393 11.1908 27.6393H28.8398C30.1395 27.6393 31.2914 26.8024 31.693 25.5664L37.1468 8.78115Z"
                      fill="var(--default)"
                    />
                  </svg>
                </button>
              </label>
            ))}
          </div>
        </section>
        <section>
          <h3>Add a comment</h3>
          <textarea
            name="text"
            placeholder="Write something..."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = `0`;
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
          />
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
    </>
  );
}
