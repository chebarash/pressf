/**
 * Marks. The overall GPA comes from the LMS transcript header; a semester's GPA
 * is not in the transcript API, so it is computed here from the gradebook
 * finals with the university scale (`semesterGpa`).
 */

/** Score tier for colour: High ≥ 85, Mid ≥ 65, Low below. */
export const tier = (mark: number | null | undefined): "High" | "Mid" | "Low" | "None" =>
  mark === null || mark === undefined || !Number.isFinite(mark) ? "None" : mark >= 85 ? "High" : mark >= 65 ? "Mid" : "Low";

/**
 * The lowest final that earns the course's credits: the LMS gradebook setting
 * `minimal_final` (40 in every NewUU semester). The gradebook's
 * `final_grade.positive_status` is NOT pass/fail: it is false for any final
 * under 50, yet a 40–49 final passes (the transcript counts its ECTS). Only a
 * final under 40 (0 when the exam was missed) means a retake.
 */
export const PASS_FINAL = 40;

/** Whether a final passed: at least PASS_FINAL, or the LMS says so outright. */
export const passedFinal = (final: number | null | undefined, positive?: boolean | null): boolean | null =>
  final === null || final === undefined || !Number.isFinite(final) ? null : final >= PASS_FINAL || positive === true;

/**
 * NewUU grade points (4.5 scale), as the LMS transcript prints them: A+ 4.5,
 * A 4, B+ 3.5, B 3, C+ 2.75, C 2.5, D 2, F 0. Lowest final of each band, as
 * read off real transcripts (it reproduces the transcript's semester GPAs).
 */
export const GRADE_SCALE: ReadonlyArray<{ min: number; letter: string; points: number }> = [
  { min: 95, letter: "A+", points: 4.5 },
  { min: 85, letter: "A", points: 4 },
  { min: 75, letter: "B+", points: 3.5 },
  { min: 65, letter: "B", points: 3 },
  { min: 60, letter: "C+", points: 2.75 },
  { min: 50, letter: "C", points: 2.5 },
  { min: PASS_FINAL, letter: "D", points: 2 },
  { min: 0, letter: "F", points: 0 },
];

/** Grade points of a final (0–100); null without a final. */
export const gradePoints = (final: number | null | undefined): number | null =>
  final === null || final === undefined || !Number.isFinite(final) ? null : (GRADE_SCALE.find((g) => final >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1]).points;

export type GpaCourse = {
  final: number | null;
  /** The LMS sent the course to a resit (FX): 0 points, as on the transcript. */
  fx?: boolean;
  ects: number | null;
  /** A pass/fail course ("P" on the transcript): left out of the GPA when passed, 0 points when failed. */
  passFail?: boolean;
};

/**
 * A semester's GPA as the transcript computes it: ECTS-weighted grade points of
 * every course with a final; a failed course or FX counts as 0 with its ECTS;
 * a passed pass/fail course is left out. Null when nothing counts (no finals yet).
 */
export function semesterGpa(courses: GpaCourse[]): number | null {
  let points = 0;
  let ects = 0;
  for (const c of courses) {
    const p = gradePoints(c.final);
    if (p === null || !c.ects || c.ects <= 0) continue;
    const failed = !!c.fx || (c.final ?? 0) < PASS_FINAL;
    if (c.passFail && !failed) continue;
    points += (failed ? 0 : p) * c.ects;
    ects += c.ects;
  }
  return ects ? Math.round((points / ects) * 100) / 100 : null;
}

/** New or changed marks between two snapshots, for the "New grade" alert. */
export function changedGrades(before: Record<string, number | null>, after: Record<string, number | null>) {
  return Object.entries(after)
    .filter(([k, v]) => v !== null && before[k] !== v)
    .map(([key, mark]) => ({ key, mark: mark as number, previous: before[key] ?? null }));
}
