import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { db } from "@/lib/db";
import { courseOverrides, syllabi } from "@/lib/db/schema";
import { termRank } from "@/lib/syllabus";

type Props = { params: Promise<{ code: string }> };

export default async function AdminCourse({ params }: Props) {
  const { code } = await params;
  const [rows, [override], catalog] = await Promise.all([
    db().select().from(syllabi).where(eq(syllabi.courseCode, code)),
    db().select().from(courseOverrides).where(eq(courseOverrides.code, code)),
    getCatalog(),
  ]);
  rows.sort((a, b) => termRank(b.data) - termRank(a.data));
  const latest = { ...rows[0]?.data, ...override?.data };
  const course = catalog.courses.find((c) => c.code === code);

  async function save(form: FormData) {
    "use server";
    await requireAdmin();
    const num = (key: string) => { const v = Number(form.get(key)); return Number.isFinite(v) && form.get(key) ? v : null; };
    const data = { description: String(form.get("description") ?? ""), total_hours: num("total_hours"), ects: num("ects"), attendance_policy: String(form.get("attendance_policy") ?? "") };
    await db().insert(courseOverrides).values({ code, data }).onConflictDoUpdate({ target: courseOverrides.code, set: { data, updatedAt: new Date() } });
    revalidatePath(`/courses/${code}`);
    redirect("/admin");
  }

  async function approve(form: FormData) {
    "use server";
    await requireAdmin();
    await db().update(syllabi).set({ matched: true }).where(eq(syllabi.id, String(form.get("id"))));
    revalidatePath(`/courses/${code}`);
    redirect("/admin");
  }

  return (
    <div className="stack" style={{ "--gap": "24px", maxWidth: 800 } as React.CSSProperties}>
      <h1 className="d-lg">{course?.subject ?? code}</h1>
      {rows.map((row) => (
        <form key={row.id} action={approve} className={`field ${row.flags.length ? "check" : ""}`}>
          <input type="hidden" name="id" value={row.id} />
          <span className="label">{row.sourceName}</span>
          <span className="small soft">{row.data.course_code} {row.data.course_title}, {row.data.term} {row.data.academic_year}</span>
          {row.flags.map((flag) => <span key={flag} className="small" style={{ color: "var(--low)" }}>{flag}</span>)}
          {!row.matched && <button className="key btn sm">It is this course, show it</button>}
        </form>
      ))}
      <form action={save} className="stack">
        <label className="stack" style={{ "--gap": "4px" } as React.CSSProperties}><span className="label">Description</span><textarea className="input" id="description" name="description" rows={5} defaultValue={latest.description ?? ""} /></label>
        <div className="row"><label className="grow"><span className="label">Total hours</span><input className="input" id="total_hours" name="total_hours" inputMode="numeric" defaultValue={latest.total_hours ?? ""} /></label><label className="grow"><span className="label">ECTS</span><input className="input" id="ects" name="ects" inputMode="numeric" defaultValue={latest.ects ?? ""} /></label></div>
        <label className="stack" style={{ "--gap": "4px" } as React.CSSProperties}><span className="label">Attendance</span><textarea className="input" id="attendance_policy" name="attendance_policy" rows={2} defaultValue={latest.attendance_policy ?? ""} /></label>
        <p className="small soft">Edited fields stay when a newer syllabus arrives.</p>
        <button className="key btn primary">Save</button>
      </form>
    </div>
  );
}
