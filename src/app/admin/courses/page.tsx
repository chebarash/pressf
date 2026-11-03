import Link from "next/link";
import { Head, cx, s } from "@/screens/admin/ui";
import { requireSection } from "@/server/admin/viewer";
import { coursesPage } from "@/server/admin/views";
import { COURSE_SORTS } from "@/server/admin/sorts";
import { parseSort } from "@/core/sort";
import { UrlSortHead } from "@/ui/table/Sort";

export default async function AdminCoursesPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; dir?: string }> }) {
  await requireSection("courses");
  const sp = await searchParams;
  const data = await coursesPage(sp.q ?? "", parseSort(sp, COURSE_SORTS));
  return (
    <section className={s.main}>
      <Head title="Courses & files" sub="Pick a course to rename, move or hide its files" />
      <form className={s.search} style={{ width: 496 }} action="/admin/courses">
        <input name="q" defaultValue={data.q} placeholder="Course name or code" aria-label="Search courses" autoComplete="off" />
        {data.sort && <input type="hidden" name="sort" value={data.sort.key} />}
        {data.sort && <input type="hidden" name="dir" value={data.sort.dir} />}
        <kbd className={s.key}>↵</kbd>
      </form>
      <div className={cx(s.card, s.table)}>
        <UrlSortHead
          className={cx(s.tr, s.trHead)}
          sort={data.sort}
          columns={[
            { key: "code", label: "CODE", className: s.td, style: { width: 120 } },
            { key: "course", label: "COURSE", className: cx(s.td, s.tdGrow) },
            { key: "lms", label: "FROM LMS", className: s.td, style: { width: 110 } },
            { key: "students", label: "FROM STUDENTS", className: s.td, style: { width: 130 } },
            { key: "shares", label: "SHARES", className: s.td, style: { width: 90 } },
          ]}
        />
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
