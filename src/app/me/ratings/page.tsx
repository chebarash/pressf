import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherRow } from "@/components/Cards";
import { Empty } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { faceMap } from "@/lib/content";
import { userRatings } from "@/lib/ratings";

export const metadata = { title: "My ratings" };

export default async function MyRatings() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const [rows, catalog, faces] = await Promise.all([userRatings(user.id), getCatalog(), faceMap()]);
  return (
    <div className="wrap section">
      <div className="row between"><div><h1 className="d-title">My ratings</h1><p className="soft">{user.email} · One rating per course and teacher. Only you can see this list.</p></div><Link className="key btn sm" href="/api/auth/signout">Sign out</Link></div>
      {rows.map((row) => {
        const t = catalog.teachers.find((x) => x.id === row.teacherId);
        return t ? <TeacherRow key={row.id} morph={false} id={t.id} name={t.display_name} face={faces.get(t.id)} score={row.overall} meta={`${catalog.courses.find((c) => c.code === row.courseCode)?.subject ?? row.courseCode} · Rated ${row.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`} /> : null;
      })}
      {!rows.length && <Empty title="No ratings yet" action={<Link className="key btn" href="/professors">Find a professor</Link>}>Rate the teachers you had this term.</Empty>}
    </div>
  );
}
