/**
 * Marks. GPA and letters come from the LMS (transcript and final grade); we do
 * not recompute them, we only colour and compare what the LMS says.
 */

/** Score tier for colour: High ≥ 85, Mid ≥ 65, Low below. */
export const tier = (mark: number | null | undefined): "High" | "Mid" | "Low" | "None" =>
  mark === null || mark === undefined || !Number.isFinite(mark) ? "None" : mark >= 85 ? "High" : mark >= 65 ? "Mid" : "Low";

/** New or changed marks between two snapshots, for the "New grade" alert. */
export function changedGrades(before: Record<string, number | null>, after: Record<string, number | null>) {
  return Object.entries(after)
    .filter(([k, v]) => v !== null && before[k] !== v)
    .map(([key, mark]) => ({ key, mark: mark as number, previous: before[key] ?? null }));
}
