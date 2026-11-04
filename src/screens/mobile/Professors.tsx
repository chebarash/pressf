import Link from "next/link";
import { ScreenHint } from "@/ui/shell/Hints";
import type { ProfessorRow, ProfessorsView } from "@/server/views";
import { Chip, EmptyState, Face } from "./mc/kit";
import { cx, Screen } from "./mc/parts";
import { slugify } from "./mc/format";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

const chipLabel = (school: string) => school.replace(/^School of /i, "").replace(/ & .*/, "");

/** Mobile All professors (Figma 7.7): yours first, then A–Z; "—" under 5 ratings. `school` / `dept` are the ?school= / ?dept= slugs. */
export default function Professors({ data, school, dept }: { data: ProfessorsView; school?: string | null; dept?: string | null }) {
  const picked = data.schools.find((k) => slugify(k) === school) ?? null;
  const depts = (data.departments ?? []).filter((d) => !picked || d.school === picked);
  const pickedDept = depts.find((d) => slugify(d.name) === dept)?.name ?? null;
  const yours = new Set(data.yours.map((p) => p.id));
  const inSchool = (p: ProfessorRow) => (!picked || p.school === picked) && (!pickedDept || p.department === pickedDept);
  const mine = data.yours.filter(inSchool);
  const rest = data.all.filter((p) => !yours.has(p.id) && inSchool(p));
  return (
    <Screen>
      <div className={cx(s.body, s.tight)}>
        <h1 className={s.title54}>Professors</h1>
        <p className={cx(s.p0, s.t14, s.soft)}>{data.count} teaching this year</p>
        <ScreenHint screen="professors" ctx={{ desktop: false }} />
        <nav className={cx(c.layers, c.schoolChips)} aria-label="School">
          <Chip label="All" selected={!picked} href="/professors" />
          {data.schools.map((k) => (
            <Chip key={k} label={chipLabel(k)} selected={picked === k} href={`/professors?school=${slugify(k)}`} />
          ))}
        </nav>
        {picked && depts.length > 1 ? (
          <nav className={cx(c.layers, c.schoolChips)} aria-label="Department">
            <Chip label="All departments" selected={!pickedDept} href={`/professors?school=${slugify(picked)}`} />
            {depts.map((d) => (
              <Chip key={d.name} label={d.name.replace(/^Department of /i, "")} selected={pickedDept === d.name} href={`/professors?school=${slugify(picked)}&dept=${slugify(d.name)}`} />
            ))}
          </nav>
        ) : null}
        {mine.length ? (
          <>
            <h2 className={c.capsFlat}>Your teachers</h2>
            {mine.map((p) => (
              <Row key={p.id} p={p} strong />
            ))}
          </>
        ) : null}
        <h2 className={c.capsFlat}>All · A–Z</h2>
        {rest.length ? rest.map((p) => <Row key={p.id} p={p} />) : <EmptyState face="default" title="No one here yet" text="Teachers appear as the LMS lists them for this school." />}
      </div>
    </Screen>
  );
}

function Row({ p, strong }: { p: ProfessorRow; strong?: boolean }) {
  return (
    <Link href={p.href} prefetch={false} className={cx(s.rowCard, !strong && s.quiet, s.pressable, c.personRow)}>
      <Face src={p.face} size={40} />
      <div className={s.lines}>
        <p className={cx(s.t15sb, s.ellipsis)}>{p.name}</p>
        <p className={cx(s.t12, s.soft, s.ellipsis)}>{[p.department?.replace(/^Department of /i, ""), p.course].filter(Boolean).join(" · ") || "Teacher"}</p>
      </div>
      <span className={cx(c.pct, p.pressFPct === null && s.soft)}>{p.pressFPct === null ? "—" : `${p.pressFPct}% F`}</span>
    </Link>
  );
}
