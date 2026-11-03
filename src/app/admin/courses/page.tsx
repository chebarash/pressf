import Link from "next/link";
import { Head, cx, s } from "@/screens/admin/ui";
import { requireSection } from "@/server/admin/viewer";
import { coursesPage } from "@/server/admin/views";

export default async function AdminCoursesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSection("courses");
  const data = await coursesPage((await searchParams).q ?? "");
  return (
    <section className={s.main}>
      <Head title="Courses & files" sub="Pick a course to rename, move or hide its files" />
      <form className={s.search} style={{ width: 496 }} action="/admin/courses">
        <input name="q" defaultValue={data.q} placeholder="Course name or code" aria-label="Search courses" autoComplete="off" />
        <kbd className={s.key}>↵</kbd>
      </form>
      <div className={cx(s.card, s.table)}>
        <div className={cx(s.tr, s.trHead)}>
          <span className={s.td} style={{ width: 120 }}>CODE</span>
          <span className={cx(s.td, s.tdGrow)}>COURSE</span>
          <span className={s.td} style={{ width: 110 }}>FROM LMS</span>
          <span className={s.td} style={{ width: 130 }}>FROM STUDENTS</span>
          <span className={s.td} style={{ width: 90 }}>SHARES</span>
        </div>
        {data.courses.length === 0 && <p className={s.small} style={{ padding: 12 }}>No course matches “{data.q}”.</p>}
        {data.courses.map((c) => (
          <Link key={c.code} href={`/admin/courses/${encodeURIComponent(c.code)}`} className={cx(s.tr, s.trLink)} prefetch={false}>
            <span className={s.td} style={{ width: 120 }}>{c.code}</span>
            <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{c.name}</span>
            <span className={s.td} style={{ width: 110 }}>{c.lms}</span>
            <span className={s.td} style={{ width: 130 }}>{c.students}</span>
            <span className={s.td} style={{ width: 90 }} title="Sent from the bot's inline mode">{c.shares}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
