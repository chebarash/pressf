import { db } from "@/lib/db";
import { searchEvents } from "@/lib/db/schema";
import { faceMap, fileCounts } from "@/lib/content";
import { courseRatings } from "@/lib/ratings";
import { search } from "@/lib/search";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const { courses, teachers, files } = await search(query, { courses: query.trim() ? 5 : 3, teachers: 4, files: 3 });
  const [cScores, photos, counts] = await Promise.all([courseRatings(), faceMap(), fileCounts()]);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const results = [
    ...courses.map((c) => {
      const count = counts.get(c.code) ?? 0;
      return { kind: "Course", id: c.code, title: c.subject, subtitle: [c.code, count ? plural(count, "file") : null, c.teachers.length ? plural(c.teachers.length, "teacher") : null].filter(Boolean).join(" · "), href: `/courses/${c.code}`, score: cScores.get(c.code)?.overall ?? null };
    }),
    ...teachers.map((t) => ({ kind: "Professor", id: t.id, title: t.display_name, subtitle: ["Professor", t.department?.replace(/^Department of /, "")].filter(Boolean).join(" · "), href: `/professors/${t.id}`, face: photos.get(t.id) ?? null })),
    ...files.map((f) => ({ kind: "File", id: f.id, title: f.fileName.replace(/\.[a-z0-9]+$/i, ""), subtitle: [f.type && f.type[0].toUpperCase() + f.type.slice(1), f.courseCode].filter(Boolean).join(" · "), href: `/files/${f.id}` })),
  ];
  return Response.json({ results });
}

/** Anonymous on purpose: counts what was opened, never who opened it. */
export async function POST(request: Request) {
  const { kind, id } = await request.json();
  if (typeof kind === "string" && typeof id === "string") {
    await db().insert(searchEvents).values({ kind, targetId: id.slice(0, 80) });
  }
  return new Response(null, { status: 204 });
}
