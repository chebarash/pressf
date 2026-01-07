"use client";

import { ProfessorType, RatingType } from "@/types/types";
import { useEffect, useRef, useState } from "react";
import styles from "@/styles/Form.module.css";
import Course from "./Course";
import { rateProfessor } from "@/lib/professor";
import Modal from "./Modal";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import StarInput from "./StarInput";

const formDataToUrl = (formData: FormData): string => {
  const params = new URLSearchParams();

  formData.forEach((value, key) => {
    params.append(key, value.toString());
  });

  return params.toString();
};

const criteria = [
  ["clarity", "How easy it was to understand the explanations.", "Clarity"],
  [
    "organization",
    "How well the course was structured and planned.",
    "Organization",
  ],
  ["expertise", "How well the professor knows the subject.", "Expertise"],
  ["fairGrading", "How fair and transparent the grading felt.", "Fair Grading"],
  [
    "engagement",
    "How supportive, approachable, and involved the professor was.",
    "Engagement",
  ],
];

export default function Form({ courses, id }: ProfessorType) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [selectedCourses, setCourses] = useState<string[]>([]);
  const [rate, setRate] = useState<RatingType>({
    overall: 0,
    clarity: 0,
    engagement: 0,
    organization: 0,
    expertise: 0,
    fairGrading: 0,
  });
  const [text, setText] = useState<string>("");
  const [showModal, setShowModal] = useState<boolean>(false);
  const { data: session } = useSession();

  const searchParams = useSearchParams();

  useEffect(() => {
    const courses = searchParams.getAll("courses");
    const clarity = searchParams.get("clarity");
    const engagement = searchParams.get("engagement");
    const organization = searchParams.get("organization");
    const expertise = searchParams.get("expertise");
    const fairGrading = searchParams.get("fairGrading");
    const text = searchParams.get("text");
    if (courses.length < 1 || !rate || !session) return;
    const formData = new FormData();
    courses.forEach((course) => formData.append("courses", course));
    formData.append("clarity", clarity || `0`);
    formData.append("engagement", engagement || `0`);
    formData.append("organization", organization || `0`);
    formData.append("expertise", expertise || `0`);
    formData.append("fairGrading", fairGrading || `0`);
    formData.append("text", text || ``);
    formData.append(`professor`, id);
    rateProfessor(formData).then(() => {
      router.replace(`/professors/${id}`, {
        scroll: false,
      });
      ref.current?.reset();
      setCourses([]);
      setRate({
        overall: 0,
        clarity: 0,
        engagement: 0,
        organization: 0,
        expertise: 0,
        fairGrading: 0,
      });
      setText("");
    });
  }, [id, router, searchParams, session, ref]);

  return (
    <>
      {showModal && (
        <Modal title="Sign in" onClose={() => setShowModal(false)}>
          <p>
            You need to sign in to leave a review.
            <br />
            <br />
            Don’t worry—your <b>review will be anonymous</b>, and your name will
            be <b>replaced with a randomly generated one</b>.
            <br />
            <br />
            Sign in needed only to prevent spam and ensure the quality of
            reviews.
          </p>
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
          setRate({
            overall: 0,
            clarity: 0,
            engagement: 0,
            organization: 0,
            expertise: 0,
            fairGrading: 0,
          });
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
            {courses.map(({ id, name, code }) => (
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
                  code={code}
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
        {criteria.map(([category, description, label]) => (
          <section key={category}>
            <h3 className={styles.star}>{label}</h3>
            <p>{description}</p>
            <StarInput
              rate={rate[category as keyof RatingType]}
              setRate={(r: number) =>
                setRate((prev) => ({ ...prev, [category]: r }))
              }
              name={category}
            />
          </section>
        ))}
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
