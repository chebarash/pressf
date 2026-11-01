import { findCourse, getCatalog } from "@/lib/catalog";
import { fileCounts } from "@/lib/content";
import { OG_SIZE, previewCard, ScoreTile } from "@/lib/preview/card";
import { courseRatings } from "@/lib/ratings";

export const alt = "Course on Press F";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const course = findCourse(await getCatalog(), code);
  if (!course) return previewCard({ eyebrow: "Course", title: "Press F", lines: [] });
  const [ratings, counts] = await Promise.all([courseRatings(), fileCounts()]);
  const rating = ratings.get(course.code);
  const files = counts.get(course.code) ?? 0;
  const lines = [
    [`${course.teachers.length} ${course.teachers.length === 1 ? "teacher" : "teachers"}`, files ? `${files} ${files === 1 ? "file" : "files"}` : null].filter(Boolean).join(" · "),
    rating ? `${rating.count} ${rating.count === 1 ? "rating" : "ratings"}` : "No ratings yet",
  ];
  return previewCard({ eyebrow: course.code, title: course.subject, lines, side: <ScoreTile value={rating?.overall} size={280} /> });
}
