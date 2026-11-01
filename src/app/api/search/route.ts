import { ilike, eq, and } from "drizzle-orm";
import { getCatalog } from "@/lib/catalog";
import { db } from "@/lib/db";
import { materials, searchEvents } from "@/lib/db/schema";

const fold = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ'’`]/g, "").replace(/[^a-z0-9а-я ]/g, " ");

export async function GET(request: Request) {
  const q = fold(new URL(request.url).searchParams.get("q") ?? "").trim();
  const { courses, teachers } = await getCatalog();
  const hits = (value: string) => !q || q.split(/\s+/).every((word) => fold(value).includes(word));
  const results = [
    ...courses.filter((c) => hits(`${c.code} ${c.subject} ${c.aliases.join(" ")}`)).slice(0, q ? 5 : 3)
      .map((c) => ({ kind: "Course", id: c.code, title: c.subject, subtitle: c.code, href: `/courses/${c.code}` })),
    ...(q ? teachers.filter((t) => hits(`${t.name} ${t.display_name}`)).slice(0, 4)
      .map((t) => ({ kind: "Professor", id: t.id, title: t.display_name, subtitle: t.department ?? "Staff", href: `/professors/${t.id}` })) : []),
  ];
  if (q) {
    const files = await db().select().from(materials).where(and(eq(materials.status, "approved"), ilike(materials.fileName, `%${q.replace(/[%_]/g, "")}%`))).limit(3);
    results.push(...files.map((f) => ({ kind: "File", id: f.id, title: f.fileName, subtitle: f.courseCode ?? "", href: `/files/${f.id}` })));
  }
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
