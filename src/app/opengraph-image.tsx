import { OG_SIZE, previewCard } from "@/lib/preview/card";

export const alt = "Press F, the student guide to New Uzbekistan University";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return previewCard({ eyebrow: "NewUU student guide", title: "Press F to pay respects", lines: ["Courses, professors, files and timetables"] });
}
