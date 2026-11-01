import { count, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CurriculumBoard, type Term } from "@/components/Curriculum";
import { Empty } from "@/components/ui";
import { getCatalog } from "@/lib/catalog";
import { resolveRequirement } from "@/lib/content";
import { db } from "@/lib/db";
import { materials, syllabi } from "@/lib/db/schema";

type Props = { params: Promise<{ slug: string }> };

export default async function CurriculumPage({ params }: Props) {
  const { slug } = await params;
  const catalog = await getCatalog();
  const program = catalog.schools.flatMap((s) => s.programs).find((p) => p.slug === slug);
  if (!program) notFound();
  const curriculum = catalog.curricula[slug];
  const heading = <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}><div className="caps accent">{program.degree}</div><h1 className="d-title">{program.name}</h1></div>;
  if (!curriculum?.semesters.length) {
    return <div className="wrap section">{heading}<Empty title="Curriculum is only in a PDF" action={curriculum?.source_url ? <a className="key btn" href={curriculum.source_url} target="_blank" rel="noreferrer">Open on newuu.uz</a> : undefined}>The university publishes this program as a PDF, so semesters and courses are not listed here yet.</Empty></div>;
  }
  const [rows, counts] = await Promise.all([
    db().select().from(syllabi).where(eq(syllabi.matched, true)),
    db().select({ code: materials.courseCode, value: count() }).from(materials).where(sql`${materials.status} = 'approved'`).groupBy(materials.courseCode),
  ]);
  const files = new Map(counts.map((c) => [c.code, c.value]));
  const needs = new Map<string, string[]>();
  for (const row of rows) {
    const list = row.data.prerequisites.groups.flatMap((g) => g.any_of).map((i) => resolveRequirement(i, catalog.courses).code).filter((c): c is string => !!c && c !== row.courseCode);
    needs.set(row.courseCode, [...new Set([...(needs.get(row.courseCode) ?? []), ...list])]);
  }
  const unlocks = new Map<string, string[]>();
  for (const [code, list] of needs) for (const need of list) unlocks.set(need, [...(unlocks.get(need) ?? []), code]);
  const terms: Term[] = curriculum.semesters.map((s) => ({
    label: s.term ? `${s.term[0].toUpperCase()}${s.term.slice(1)}` : `Semester ${s.number ?? ""}`,
    year: s.year,
    tiles: s.courses.map((c) => ({ code: c.code, subject: c.subject, credits: c.credits, type: c.type, files: files.get(c.code) ?? 0, needs: needs.get(c.code) ?? [], unlocks: unlocks.get(c.code) ?? [] })),
  }));
  return <div className="wrap section">{heading}<CurriculumBoard terms={terms} /></div>;
}
