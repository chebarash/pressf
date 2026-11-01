export const CRITERIA = [
  ["clarity", "Clarity", "Are explanations easy to follow?"],
  ["engagement", "Engagement", "Do you want to show up?"],
  ["organization", "Organization", "Is the course well structured?"],
  ["expertise", "Expertise", "Do they know the subject deeply?"],
  ["fairGrading", "Fair grading", "Is the grading fair and clear?"],
] as const;

export type Tier = "High" | "Mid" | "Low" | "None";

export const tierOf = (score: number | null | undefined): Tier =>
  score == null ? "None" : score >= 3.7 ? "High" : score >= 3 ? "Mid" : "Low";
