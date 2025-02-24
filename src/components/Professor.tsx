"use client";

import { FeedbackType, ProfessorType } from "@/types/types";
import Profile from "./Profile";
import Feedback from "./Feedback";
import { useState } from "react";

export default function Professor({
  professor,
  feedbacks,
}: {
  professor: ProfessorType;
  feedbacks: FeedbackType[];
}) {
  const [courseFilter, setCourseFilter] = useState(``);

  return (
    <>
      <Profile
        {...professor}
        courseFilter={courseFilter}
        setCourseFilter={setCourseFilter}
      />
      <section>
        {feedbacks?.length ? (
          <ul style={{ display: `flex`, flexDirection: `column`, gap: `80px` }}>
            {feedbacks.map((feedback) => (
              <Feedback
                key={feedback.id}
                {...feedback}
                courseFilter={courseFilter}
                setCourseFilter={setCourseFilter}
              />
            ))}
          </ul>
        ) : (
          <div>No feedback yet</div>
        )}
      </section>
    </>
  );
}
