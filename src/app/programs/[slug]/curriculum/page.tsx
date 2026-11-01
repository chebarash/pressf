import { count, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CurriculumBoard, type Term } from "@/components/Curriculum";
import Link from "next/link";
import { Crumbs, Empty } from "@/components/ui";
import { getCatalog } from "@/lib/catalog";
import { faceMap, resolveRequirement } from "@/lib/content";
import { courseRatings } from "@/lib/ratings";
import { db } from "@/lib/db";
import { materials, syllabi } from "@/lib/db/schema";

type Props = { params: Promise<{ slug: string }> };

export default async function CurriculumPage({ params }: Props) {
  const { slug } = await params;
  const catalog = await getCatalog();
  const program = catalog.schools.flatMap((s) => s.programs).find((p) => p.slug === slug);
  if (!program) notFound();
  const curriculum = catalog.curricula[slug];
  const school = catalog.schools.find((s) => s.programs.some((p) => p.slug === slug))!;
  const heading = (
    <div className="stack">
      <Crumbs items={[["Schools", "/schools"], [school.name.replace(/^School of /, "").split(",")[0], `/schools/${school.slug}`], [program.name]]} />
      <h1 className="d-title">Curriculum</h1>
      <div className="tabs">{school.programs.map((p) => <Link key={p.slug} className={`tab ${p.slug === slug ? "on" : ""}`} href={`/programs/${p.slug}/curriculum`}>{p.name}</Link>)}</div>
    </div>
  );
  if (!curriculum?.semesters.length) {
    return <div className="wrap section">{heading}<Empty title="Curriculum is only in a PDF" action={curriculum?.source_url ? <a className="key btn" href={curriculum.source_url} target="_blank" rel="noreferrer">Open on newuu.uz</a> : undefined}>The university publishes this program as a PDF, so semesters and courses are not listed here yet.</Empty></div>;
  }
  const [scores, photos] = await Promise.all([courseRatings(), faceMap()]);
  const teacherName = new Map(catalog.teachers.map((t) => [t.id, t.display_name]));
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
    tiles: s.courses.map((c) => {
      const ids = catalog.courses.find((course) => course.code === c.code)?.teachers ?? [];
      return { code: c.code, subject: c.subject, credits: c.credits, type: c.type, files: files.get(c.code) ?? 0, needs: needs.get(c.code) ?? [], unlocks: unlocks.get(c.code) ?? [], score: scores.get(c.code)?.overall ?? null, teachers: ids.length, faces: ids.slice(0, 2).map((id) => ({ name: teacherName.get(id) ?? "", src: photos.get(id) ?? null })) };
    }),
  }));
  return <div className="wrap section">{heading}<CurriculumBoard terms={terms} /></div>;
}
