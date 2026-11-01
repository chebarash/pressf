/* eslint-disable jsx-a11y/alt-text */
import { findTeacher, getCatalog } from "@/lib/catalog";
import { OG_SIZE, previewCard, ScoreTile } from "@/lib/preview/card";
import { faceData } from "@/lib/preview/faces";
import { teacherRatings } from "@/lib/ratings";

export const alt = "Professor on Press F";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const teacher = findTeacher(await getCatalog(), id);
  if (!teacher) return previewCard({ eyebrow: "Professor", title: "Press F", lines: [] });
  const [ratings, face] = await Promise.all([teacherRatings(), faceData(teacher.id)]);
  const rating = ratings.get(teacher.id);
  const lines = [teacher.department ?? "NewUU", rating ? `${rating.count} ${rating.count === 1 ? "rating" : "ratings"}` : "No ratings yet"];
  return previewCard({
    eyebrow: "Professor", title: teacher.display_name, lines,
    side: <div style={{ display: "flex", position: "relative", width: 400, height: 400 }}><img src={face} width={400} height={400} /><div style={{ display: "flex", position: "absolute", right: 0, bottom: 8 }}><ScoreTile value={rating?.overall} size={130} /></div></div>,
  });
}
