import Link from "next/link";
import type { SchoolsView } from "@/server/views";
import { EmptyState } from "./mc/kit";
import { Chevron, cx, Screen } from "./mc/parts";
import { schoolTone } from "./mc/format";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

/**
 * Mobile Schools and programs (Figma 7.8). With `schoolId` (/schools/[id]) it
 * lists that school's programs, each opening its curriculum (7.6).
 */
export default function Schools({ data, schoolId }: { data: SchoolsView; schoolId?: string | null }) {
  const school = schoolId ? data.schools.find((k) => k.id === schoolId) ?? null : null;
  const items = school
    ? school.programs.map((p) => ({ key: p.id, name: p.name, line: "", href: `/programs/${p.id}/curriculum`, tone: schoolTone(school.name) }))
    : data.schools.map((k) => ({ key: k.id, name: k.name, line: k.programs.map((p) => p.name).join(" · "), href: `/schools/${k.id}`, tone: schoolTone(k.name) }));
  const line = school
    ? `${school.programs.length} ${school.programs.length === 1 ? "program" : "programs"}`
    : `${data.schools.length} ${data.schools.length === 1 ? "school" : "schools"} · ${data.programCount} ${data.programCount === 1 ? "program" : "programs"}`;
  return (
    <Screen>
      <div className={cx(s.body, s.tight)}>
        <h1 className={`${s.title54} pf-m-title`}>{school?.name ?? "Schools"}</h1>
        <p className={cx(s.p0, s.t14, s.soft)}>{line}</p>
        {items.length ? (
          items.map((i) => (
            <Link key={i.key} href={i.href} prefetch className={cx(s.rowCard, s.pressable, c.schoolCard, i.tone && c[i.tone])}>
              <div className={s.lines}>
                <p className={s.t15sb}>{i.name}</p>
                {i.line ? <p className={cx(s.t12, s.soft)} style={{ lineHeight: 1.32 }}>{i.line}</p> : null}
              </div>
              <Chevron />
            </Link>
          ))
        ) : (
          <EmptyState title="Nothing here yet" text="Programs appear as the LMS lists them." />
        )}
      </div>
    </Screen>
  );
}
