import Image from "next/image";
import Link from "next/link";
import { CourseCard, FileRow, Keycap } from "@/ui/components";
import { ArrowRightIcon } from "@/ui/icons";
import s from "../mobile.module.css";
import g from "./guest.module.css";
import { SignInBar } from "./SignInBar";
import type { GuestHomeData } from "./types";

/** School colours in the university's order: Computing, Engineering, Management, Humanities & Sciences, Medicine. */
const SCHOOL_TONES = [g.teal, g.rust, g.mustard, g.plum, g.moss];

const toneFor = (name: string, i: number) => {
  const n = name.toLowerCase();
  const at = n.includes("comput") ? 0 : n.includes("engineer") ? 1 : n.includes("manage") || n.includes("business") ? 2 : n.includes("human") || n.includes("science") ? 3 : n.includes("medic") ? 4 : i;
  return SCHOOL_TONES[at % SCHOOL_TONES.length];
};

/** Today for someone not signed in (Figma 1.2 Guest home content). */
export function GuestHome({ data }: { data: GuestHomeData }) {
  return (
    <div className={s.screen}>
      <header className={g.hero}>
        <Image src="/cover.png" alt="" fill priority sizes="480px" className={g.heroPhoto} />
        <h1 className={`${g.heroTitle} t-mobile-hero`} aria-label="Press F to pay respects">
          <span aria-hidden>
            Press <Keycap label="F" size="m" tabIndex={-1} className={g.keycap} />
            <br />
            to pay
            <br />
            <em className={g.accentWord}>respects</em>
          </span>
        </h1>
        <p className="t-body-md">Not all heroes wear capes… Some just teach really well. Everything about NewUU courses, from the people who took them.</p>
      </header>

      <div className={s.content}>
        {data.popular.length > 0 && (
          <section className={s.list} aria-label="Most searched">
            <h2 className={`${s.sectionTitle} t-mobile-section`}>Most searched</h2>
            {data.popular.map((c) => (
              <CourseCard
                key={c.code}
                code={c.code}
                name={c.name}
                href={c.href}
                line={c.line ?? undefined}
                teacher={c.teacher ? { name: c.teacher.name, face: null } : undefined}
                recommend={c.recommendPct == null ? undefined : { pct: c.recommendPct }}
              />
            ))}
          </section>
        )}

        {data.freshFiles.length > 0 && (
          <section className={s.list12} aria-label="Fresh files">
            <h2 className={`${s.sectionTitle} t-mobile-section`}>Fresh files</h2>
            {data.freshFiles.map((f) => (
              <FileRow key={f.id} title={f.title} type={f.type} course={f.course} date={f.date ?? undefined} source={f.source} href={f.href} />
            ))}
          </section>
        )}

        {data.schools.length > 0 && (
          <section className={s.list} aria-label="Start with your school">
            <h2 className={`${s.sectionTitle} t-mobile-section`}>Start with your school</h2>
            {data.schools.map((school, i) => (
              <Link key={school.id} href={`/schools/${encodeURIComponent(school.id)}`} className={`${g.school} ${toneFor(school.name, i)}`}>
                <span className="t-label-xs">School of</span>
                <span className={`${g.schoolName} t-display-xs`}>{school.name.replace(/^School of\s+/i, "")}</span>
                <span className={g.schoolFoot}>
                  <span className="t-body-sm">{school.programs.map((p) => p.name).join(", ")}</span>
                  <ArrowRightIcon size={20} />
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>

      <SignInBar />
    </div>
  );
}
