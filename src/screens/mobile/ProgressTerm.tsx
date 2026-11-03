import type { TermResultsView } from "@/server/views";
import { SemesterResults } from "./Progress";

/** An earlier semester's results (5.1 "Earlier semesters" → the 5.6 layout), with a way on to the curriculum. */
export default function ProgressTerm({ data }: { data: TermResultsView }) {
  return (
    <SemesterResults
      term={data.term}
      line={termLine(data)}
      kpis={[
        data.gpa != null ? { value: data.gpa.toFixed(2), label: "semester GPA" } : null,
        data.overallGpa != null ? { value: data.overallGpa.toFixed(2), label: data.gpa != null ? "overall" : "overall GPA" } : null,
        data.ects != null ? { value: String(data.ects), label: "ECTS this semester" } : data.ectsEarned != null ? { value: String(data.ectsEarned), label: data.ectsTotal ? `of ${data.ectsTotal} ECTS` : "ECTS" } : null,
      ]}
      courses={data.courses.map((c, i) => ({ key: c.courseId ?? `${c.name}-${i}`, name: c.name, mark: c.mark, passed: c.passed, fx: c.fx, ects: c.ects, href: c.href }))}
      rate={data.rate ? { term: data.term, waiting: data.rate.waiting, href: data.rate.href } : null}
      footer={{ label: "See your curriculum", sub: "Every semester of your program, with what's left", href: data.curriculumHref }}
    />
  );
}

/** "Final grades · semester GPA 3.66" or "5 of 6 passed". */
export function termLine(data: Pick<TermResultsView, "gpa" | "passed" | "courses">) {
  if (!data.courses.length) return "No courses recorded for this semester";
  return `Final grades · ${data.gpa != null ? `semester GPA ${data.gpa.toFixed(2)}` : `${data.passed} of ${data.courses.length} passed`}`;
}
