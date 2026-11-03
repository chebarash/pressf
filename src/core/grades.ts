/**
 * Marks. GPA and letters come from the LMS (transcript and final grade); we do
 * not recompute them, we only colour and compare what the LMS says.
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

/** New or changed marks between two snapshots, for the "New grade" alert. */
export function changedGrades(before: Record<string, number | null>, after: Record<string, number | null>) {
  return Object.entries(after)
    .filter(([k, v]) => v !== null && before[k] !== v)
    .map(([key, mark]) => ({ key, mark: mark as number, previous: before[key] ?? null }));
}
