import Link from "next/link";
import { FileRow } from "@/components/Cards";
import { FilterSelect } from "@/components/FilterSelect";
import { Pager } from "@/components/Pager";
import { SignInGate } from "@/components/SignInGate";
import { Arrow, Empty, PageSearch } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { publishedFiles, schoolOfCourse } from "@/lib/content";
import { groupByCourse, termOrder } from "@/lib/files";
import { MATERIAL_KINDS } from "@/lib/db/schema";
import { currentGroup } from "@/lib/group";

export const metadata = { title: "Files" };
type Props = { searchParams: Promise<{ type?: string; term?: string; mine?: string; school?: string; course?: string; q?: string; page?: string }> };

const GROUPS_PER_PAGE = 10;
const PREVIEW = 3;

export default async function Files({ searchParams }: Props) {
  const { type, term, mine, school, course, q = "", page = "1" } = await searchParams;
  // Guests never receive the file list; the data is not fetched for them.
  const user = await getUser();
  if (!user) {
    return (
      <div className="wrap section">
        <h1 className="d-title">Files</h1>
        <p className="body-lg soft">Syllabi, past exams, mocks and solutions shared by students.</p>
        <SignInGate title="Sign in to see the files" note="Files are available to NewUU students. Sign in with your university account to open them." lines={6} />
      </div>
    );
  }
  const [all, group, catalog] = await Promise.all([publishedFiles(), currentGroup(), getCatalog()]);
  const myCodes = new Set(group ? catalog.timetable.filter((lesson) => lesson.class === group).map((lesson) => lesson.code) : []);
  const onlyMine = !!mine && myCodes.size > 0;
  const needle = q.toLowerCase();
  const list = all.filter((f) => (!type || (type === "solutions" ? f.hasSolutions : f.type === type)) && (!term || f.term === term) && (!course || f.courseCode === course) && (!onlyMine || (f.courseCode && myCodes.has(f.courseCode))) && (!school || (f.courseCode && schoolOfCourse(f.courseCode, catalog).some((s) => s.slug === school))) &&
    (!needle || `${f.fileName} ${f.courseName ?? ""} ${f.courseCode ?? ""} ${f.term ?? ""}`.toLowerCase().includes(needle)));
  const n = Math.max(1, Number(page) || 1);
  const terms = [...new Set(all.flatMap((f) => f.term ?? []))].sort((a, b) => termOrder(b) - termOrder(a));
  const groups = groupByCourse(list, myCodes);
  const shownGroups = groups.slice((n - 1) * GROUPS_PER_PAGE, n * GROUPS_PER_PAGE);
  const link = (next: { type?: string; term?: string; mine?: string; school?: string; course?: string }) => `/files?${new URLSearchParams(Object.entries({ type, term, mine, school, course, q: q || undefined, ...next }).filter((e): e is [string, string] => !!e[1]))}`;
  return (
    <div className="wrap section">
      <h1 className="d-title">Files</h1>
      <p className="body-lg soft">Syllabi, past exams, mocks and solutions shared by students.</p>
      <div style={{ maxWidth: 800 }}><PageSearch value={q} placeholder="Search by course, year or file name" label="Search files">{type && <input type="hidden" name="type" value={type} />}{term && <input type="hidden" name="term" value={term} />}{mine && <input type="hidden" name="mine" value={mine} />}{school && <input type="hidden" name="school" value={school} />}{course && <input type="hidden" name="course" value={course} />}</PageSearch></div>
      <div className="filters">
        <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
          <Link className={`chip small-chip ${!type ? "on" : ""}`} href={link({ type: undefined })}>All</Link>
          {[...MATERIAL_KINDS, "solutions"].map((kind) => <Link key={kind} className={`chip small-chip ${type === kind ? "on" : ""}`} href={link({ type: type === kind ? undefined : kind })}>{kind[0].toUpperCase() + kind.slice(1)}</Link>)}
        </div>
        <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
          {myCodes.size > 0 && <Link className={`chip small-chip ${onlyMine ? "on" : ""}`} href={link({ mine: onlyMine ? undefined : "1" })}>My courses</Link>}
          <FilterSelect label="School" value={school ?? ""} options={[{ label: "All schools", value: "", href: link({ school: undefined }) }, ...catalog.schools.map((s) => ({ label: s.name.replace(/^School of /, "").split(",")[0], value: s.slug, href: link({ school: s.slug }) }))]} />
          <FilterSelect label="Semester" value={term ?? ""} options={[{ label: "All semesters", value: "", href: link({ term: undefined }) }, ...terms.map((item) => ({ label: item, value: item, href: link({ term: item }) }))]} />
          {(type || term || school || mine || course) && <Link className="ghost" href="/files">Clear filters</Link>}
          <span className="small soft" style={{ marginLeft: "auto" }}>{list.length} {list.length === 1 ? "file" : "files"}</span>
        </div>
      </div>
      <div className="stack" style={{ "--gap": "32px" } as React.CSSProperties}>
        {shownGroups.map((group) => (
          <section key={group.code ?? "other"} className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
            <div className="row between">
              <div className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
                {group.code ? <Link className="d-xs serif teacher-name" href={`/courses/${group.code}`}>{group.name}</Link> : <span className="d-xs serif teacher-name">{group.name}</span>}
                <span className="small soft">{[group.code, `${group.files.length} ${group.files.length === 1 ? "file" : "files"}`].filter(Boolean).join(" · ")}</span>
              </div>
              {group.code && !course && group.files.length > PREVIEW && <Link className="ghost" href={link({ course: group.code })}>All {group.files.length} files<Arrow /></Link>}
            </div>
            {(course ? group.files : group.files.slice(0, PREVIEW)).map((file) => <FileRow key={file.id} file={file} short />)}
          </section>
        ))}
      </div>
      <Pager page={n} pages={Math.ceil(groups.length / GROUPS_PER_PAGE)} query={{ q: q || undefined, type, term, mine, school, course }} />
      <Empty title={list.length ? "Missing something?" : "Nothing here yet"} action={<a className="key btn" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Send on Telegram</a>}>Send past exams or notes to our Telegram bot. We check them and add them here.</Empty>
    </div>
  );
}
