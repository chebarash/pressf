import { desc } from "drizzle-orm";
import Link from "next/link";
import { Tag } from "@/components/ui";
import { db } from "@/lib/db";
import { syllabi } from "@/lib/db/schema";

export default async function AdminSyllabi() {
  const rows = await db().select().from(syllabi).orderBy(desc(syllabi.createdAt));
  const review = rows.filter((row) => !row.matched || row.flags.length);
  return (
    <div className="stack">
      <h1 className="d-lg">Syllabi</h1>
      <p className="soft">{rows.length} read, {review.length} need a look. Unmatched ones stay off the site.</p>
      {review.map((row) => (
        <Link key={row.id} className={`field ${row.flags.length ? "check" : ""}`} href={`/admin/courses/${row.courseCode}`}>
          <div className="row between"><span className="label">{row.data.course_code} {row.data.course_title}</span><Tag tone={row.matched ? "" : "warm"}>{row.matched ? "On site" : "Hidden"}</Tag></div>
          {row.flags.map((flag) => <span key={flag} className="small" style={{ color: "var(--low)" }}>{flag}</span>)}
        </Link>
      ))}
    </div>
  );
}
