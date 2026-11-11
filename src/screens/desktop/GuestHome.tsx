import Link from "next/link";
import type { GuestHomeData } from "@/screens/mobile/today/types";
import { CourseCard, FileRow } from "@/ui/components";
import { ArrowRightIcon } from "@/ui/icons";
import { SignInForm } from "@/ui/shell/SignInForm";
import { CardHead, css, cx } from "./parts";
import g from "./guest.module.css";

/** School tints in the university's order: Computing, Engineering, Management, Humanities & Sciences, Medicine. */
const SCHOOL_TONES = [g.teal, g.rust, g.mustard, g.plum, g.moss];
const toneFor = (name: string, i: number) => {
  const n = name.toLowerCase();
  const at = n.includes("comput") ? 0 : n.includes("engineer") ? 1 : n.includes("manage") || n.includes("business") ? 2 : n.includes("human") || n.includes("science") ? 3 : n.includes("medic") ? 4 : i;
  return SCHOOL_TONES[at % SCHOOL_TONES.length];
};

/** Courses in the "Most searched" grid: two rows of two beside the files. */
const POPULAR = 4;

/**
 * Today for a desktop guest: the D10 welcome (pitch, feature chips and the LMS
 * sign-in card) inside the app frame, so the sidebar stays usable, then what a
 * guest can open without signing in (1.2): most searched courses, fresh files
 * and the schools.
 */
export default function DesktopGuestHome({ data }: { data: GuestHomeData }) {
  const popular = data.popular.slice(0, POPULAR);
  const browse = popular.length > 0 || data.freshFiles.length > 0;
  return (
    <main data-desktop-screen className={cx(css.screen, g.main)}>
      <section className={g.hero} aria-labelledby="guest-title">
        <div className={g.pitch}>
          <h1 id="guest-title" className={g.title}>
            Your semester,
            <br />
            without the LMS maze.
          </h1>
          <p className={g.lede}>Timetable, files by week, grades and absences — pulled from hero.study and kept up to date. Plus what students say about every course and teacher.</p>
          <ul className="sh-welcome__chips">
            <li>Next class, one glance</li>
            <li>Files sorted by week</li>
            <li>Absences left per course</li>
            <li>Press F for good teachers</li>
          </ul>
          <p className={g.foot}>Built by a NewUU student, approved by the university. Not affiliated with hero.study.</p>
        </div>
        <div className={cx("sh-welcome__card", g.card)}>
          <SignInForm desktop next="/" guestHref={browse ? "#browse" : "/schools"} />
        </div>
      </section>

      {browse && (
        <div id="browse" className={g.browse}>
          {popular.length > 0 && (
            <section className={g.popular} aria-labelledby="guest-popular">
              <CardHead title={<span id="guest-popular">Most searched</span>} />
              <div className={g.cards}>
                {popular.map((c) => (
                  <CourseCard key={c.code} code={c.code} name={c.name} href={c.href} line={c.line ?? undefined} teacher={c.teacher ? { name: c.teacher.name, face: c.teacher.face ?? null } : undefined} recommend={c.recommendPct == null ? undefined : { pct: c.recommendPct }} />
                ))}
              </div>
            </section>
          )}
          {data.freshFiles.length > 0 && (
            <section className={cx(css.card, g.files)} aria-labelledby="guest-files">
              <CardHead title={<span id="guest-files">Fresh files</span>} />
              <div className={g.fileList}>
                {data.freshFiles.map((f) => (
                  <FileRow key={f.id} title={f.title} type={f.type} course={f.course} date={f.date ?? undefined} source={f.source} href={f.href} />
                ))}
              </div>
              <p className={g.note}>Sign in to open the files of your own courses.</p>
            </section>
          )}
        </div>
      )}

      {data.schools.length > 0 && (
        <section className={g.schoolsSection} aria-labelledby="guest-schools">
          <CardHead title={<span id="guest-schools">Start with your school</span>} link="All schools" href="/schools" />
          <div className={g.schools}>
            {data.schools.map((school, i) => (
              <Link prefetch key={school.id} href={`/schools/${encodeURIComponent(school.id)}`} className={cx(g.school, toneFor(school.name, i))}>
                <span className={g.schoolHead}>
                  <span className={g.schoolOf}>School of</span>
                  <span className={g.schoolName}>{school.name.replace(/^School of\s+/i, "")}</span>
                </span>
                <span className={g.schoolFoot}>
                  <span className={g.programs}>{school.programs.map((p) => p.name).join(", ")}</span>
                  <ArrowRightIcon size={20} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
