"use client";

import Link from "next/link";
import { useRef } from "react";
import type { profilesPage } from "@/server/admin/profiles";
import { ProfileEditor } from "./ProfileEditor";
import { Chip, Head, cx, s } from "./ui";
import { useKeys } from "./useKeys";

export type ProfilesData = Awaited<ReturnType<typeof profilesPage>>;

/** The tab row shared by Faces, Profile and Unmatched from newuu.uz. */
export function ProfessorTabs({ active }: { active: "faces" | "profile" | "newuu" }) {
  return (
    <div className={s.tabs}>
      <Link href="/admin/professors" className={s.chip}>Duplicates</Link>
      <Link href="/admin/professors?tab=all" className={s.chip}>All</Link>
      <Link href="/admin/professors?tab=faces" className={cx(s.chip, active === "faces" && s.chipInverse)}>Faces</Link>
      <Link href="/admin/professors?tab=profile" className={cx(s.chip, active === "profile" && s.chipInverse)}>Profile</Link>
      <Link href="/admin/professors?tab=newuu" className={cx(s.chip, active === "newuu" && s.chipInverse)}>Unmatched from newuu.uz</Link>
    </div>
  );
}

/** A6 Professors · Profile: pick a professor, edit what their page shows (office, email, hours…). */
export function ProfessorProfiles({ data, canEdit }: { data: ProfilesData; canEdit: boolean }) {
  const search = useRef<HTMLInputElement>(null);
  useKeys({ "/": () => search.current?.focus() });
  const href = (id: string) => `/admin/professors?${new URLSearchParams({ tab: "profile", ...(data.q ? { q: data.q } : {}), id })}`;
  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 460 }}>
        <Head title="Professors" sub={`${data.imported} of ${data.total} matched on newuu.uz · ${data.edited} edited`} />
        <ProfessorTabs active="profile" />
        <form className={s.search} action="/admin/professors">
          <input type="hidden" name="tab" value="profile" />
          <input ref={search} name="q" defaultValue={data.q} placeholder="Professor's name" aria-label="Search professors" autoComplete="off" />
          <kbd className={s.key}>/ to filter</kbd>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.list.length === 0 && <p className={s.small}>Nobody matches “{data.q}”.</p>}
          {data.list.map((t) => (
            <Link key={t.id} href={href(t.id)} className={cx(s.tr, s.trLink, t.id === data.selected?.id && s.trSelected)} prefetch={false} scroll={false}>
              <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{t.name}</span>
              <span className={s.td} style={{ width: 150, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {t.edited && <Chip tone="mustard">EDITED</Chip>}
                {t.imported ? <Chip tone="moss">NEWUU</Chip> : <Chip>LMS ONLY</Chip>}
              </span>
            </Link>
          ))}
        </div>
      </section>
      {data.selected ? <ProfileEditor key={data.selected.id + (data.selected.updatedAt ?? "")} data={data.selected} canEdit={canEdit} /> : <section className={s.detail} />}
    </>
  );
}
