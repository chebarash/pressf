import Link from "next/link";
import { notFound } from "next/navigation";
import { MentionCard } from "@/components/Cards";
import { Pager, PER_PAGE } from "@/components/Pager";
import { Empty } from "@/components/ui";
import { findCourse, getCatalog } from "@/lib/catalog";
import { channelPosts, mentionsFor, type MentionSubject } from "@/lib/content";

export const metadata = { title: "Posts" };
type Props = { searchParams: Promise<{ course?: string; professor?: string; q?: string; sort?: string; page?: string }> };

export default async function Posts({ searchParams }: Props) {
  const { course: code, professor, q = "", sort, page = "1" } = await searchParams;
  const n = Math.max(1, Number(page) || 1);
  const catalog = await getCatalog();
  const course = code ? findCourse(catalog, code) : undefined;
  const teacher = professor ? catalog.teachers.find((t) => t.id === professor) : undefined;
  if ((code && !course) || (professor && !teacher)) notFound();
  const subject: MentionSubject | null = course ? { kind: "course", course } : teacher ? { kind: "teacher", teacher } : null;
  const order = sort === "new" ? "new" : "best";
  const scope = { course: course?.code, professor: teacher?.id };

  let items, total;
  if (subject) {
    const needle = q.trim().toLowerCase();
    const all = (await mentionsFor(subject, order)).filter((post) => post.text.toLowerCase().includes(needle));
    items = all.slice((n - 1) * PER_PAGE, n * PER_PAGE);
    total = all.length;
  } else {
    ({ items, total } = await channelPosts(q, PER_PAGE, (n - 1) * PER_PAGE));
  }
  const about = course ? { name: course.subject, href: `/courses/${course.code}` } : teacher ? { name: teacher.display_name, href: `/professors/${encodeURIComponent(teacher.id)}` } : null;
  const sortHref = (value?: string) => `?${new URLSearchParams(Object.entries({ ...scope, q: q || undefined, sort: value }).filter((e): e is [string, string] => !!e[1]))}`;

  return (
    <div className="wrap section">
      <h1 className="d-title">What Anonymous says</h1>
      {about && <p className="body-lg soft">About <Link className="accent" href={about.href}>{about.name}</Link>. <Link className="accent" href="/posts">See every post</Link></p>}
      <p className="soft">Anonymous posts, unverified. Press F never edits them and every card links to the original.</p>
      {subject && <p className="small soft">Posts that clearly name {course ? "the course" : "the person"} come first. Possible match means the post was linked by a partial name and may be about something else. This is not a check of whether a post is true.</p>}
      <form action="/posts">
        {course && <input type="hidden" name="course" value={course.code} />}
        {teacher && <input type="hidden" name="professor" value={teacher.id} />}
        {sort && <input type="hidden" name="sort" value={sort} />}
        <input className="input" name="q" defaultValue={q} placeholder="Search posts" aria-label="Search posts" />
      </form>
      {subject && (
        <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
          <Link className={`chip ${order === "best" ? "on" : ""}`} href={sortHref()}>Best match</Link>
          <Link className={`chip ${order === "new" ? "on" : ""}`} href={sortHref("new")}>Newest</Link>
        </div>
      )}
      <p className="small soft">{total} {total === 1 ? "post" : "posts"}</p>
      <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>{items.map((post) => <MentionCard key={post.postId} mention={post} full />)}</div>
      <Pager page={n} pages={Math.ceil(total / PER_PAGE)} query={{ ...scope, q: q || undefined, sort }} />
      {!total && <Empty title="No posts found" action={<Link className="key btn" href="/posts">See every post</Link>}>Try a different word, or read the whole channel.</Empty>}
    </div>
  );
}
