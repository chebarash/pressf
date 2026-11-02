import Link from "next/link";
import type { ProfessorRow, ProfessorsView } from "@/server/views";
import { Chip, EmptyState, Face } from "./mc/kit";
import { cx, Screen } from "./mc/parts";
import { slugify } from "./mc/format";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

const chipLabel = (school: string) => school.replace(/^School of /i, "").replace(/ & .*/, "");

/** Mobile All professors (Figma 7.7): yours first, then A–Z; "—" under 5 ratings. `school` is the ?school= slug. */
export default function Professors({ data, school }: { data: ProfessorsView; school?: string | null }) {
  const picked = data.schools.find((k) => slugify(k) === school) ?? null;
  const yours = new Set(data.yours.map((p) => p.id));
  const inSchool = (p: ProfessorRow) => !picked || p.school === picked;
  const mine = data.yours.filter(inSchool);
  const rest = data.all.filter((p) => !yours.has(p.id) && inSchool(p));
  return (
    <Screen>
      <div className={cx(s.body, s.tight)}>
        <h1 className={cx(s.title, "t-mobile-title")}>Professors</h1>
        <p className={cx(s.p0, s.t14, s.soft)}>{data.count} teaching this year</p>
        <nav className={c.layers} aria-label="School">
          <Chip label="All" selected={!picked} href="/professors" />
          {data.schools.map((k) => (
            <Chip key={k} label={chipLabel(k)} selected={picked === k} href={`/professors?school=${slugify(k)}`} />
          ))}
        </nav>
        {mine.length ? (
          <>
            <h2 className={cx(s.caps, s.p0)}>Your teachers</h2>
            {mine.map((p) => (
              <Row key={p.id} p={p} strong />
            ))}
          </>
        ) : null}
        <h2 className={cx(s.caps, s.p0)}>All · A–Z</h2>
        {rest.length ? rest.map((p) => <Row key={p.id} p={p} />) : <EmptyState face="default" title="No one here yet" text="Teachers appear as the LMS lists them for this school." />}
      </div>
    </Screen>
  );
}

function Row({ p, strong }: { p: ProfessorRow; strong?: boolean }) {
  return (
    <Link href={p.href} prefetch={false} className={cx(s.rowCard, !strong && s.quiet, s.pressable, c.personRow)}>
      <Face size={40} />
      <div className={s.lines}>
        <p className={cx(s.t16sb, s.ellipsis)}>{p.name}</p>
        <p className={cx(s.t12, s.soft, s.ellipsis)}>{[p.department?.replace(/^Department of /i, ""), p.course].filter(Boolean).join(" · ") || "Teacher"}</p>
      </div>
      <span className={cx(c.pct, p.pressFPct === null && s.soft)}>{p.pressFPct === null ? "—" : `${p.pressFPct}% F`}</span>
    </Link>
  );
}
