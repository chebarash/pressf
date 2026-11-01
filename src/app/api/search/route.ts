import { db } from "@/lib/db";
import { searchEvents } from "@/lib/db/schema";
import { search } from "@/lib/search";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const { courses, teachers, files } = await search(query, { courses: query.trim() ? 5 : 3, teachers: 4, files: 3 });
  const results = [
    ...courses.map((c) => ({ kind: "Course", id: c.code, title: c.subject, subtitle: c.code, href: `/courses/${c.code}` })),
    ...teachers.map((t) => ({ kind: "Professor", id: t.id, title: t.display_name, subtitle: t.department ?? "Staff", href: `/professors/${t.id}` })),
    ...files.map((f) => ({ kind: "File", id: f.id, title: f.fileName, subtitle: f.courseCode ?? "", href: `/files/${f.id}` })),
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
