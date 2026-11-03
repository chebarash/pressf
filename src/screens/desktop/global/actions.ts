"use server";

import { getUser } from "@/lib/auth";
import { search } from "@/server/views";

export type PaletteHit = { kind: "course" | "person" | "file"; id: string; title: string; meta: string; href: string; face?: string | null };

/** The palette's results, from the same ranked search as /search (in-memory index, no LMS). */
export async function paletteSearch(q: string): Promise<PaletteHit[]> {
  const query = q.trim().slice(0, 80);
  if (!query) return [];
  const user = await getUser();
  const v = await search(query, user ? { userId: user.id } : null, { courses: 4, people: 3, files: 3, programs: 2 });
  return [
    ...v.courses.map((c) => ({ kind: "course" as const, id: c.code, title: c.name, meta: [c.code, c.recommendPct != null && `${c.recommendPct}% recommend`].filter(Boolean).join(" · "), href: c.href })),
    // Programs sit with courses (the palette has no group of their own); the meta says what they are.
    ...v.programs.map((p) => ({ kind: "course" as const, id: `program-${p.id}`, title: p.name, meta: "Program · curriculum", href: p.href })),
    ...v.people.map((p) => ({ kind: "person" as const, id: p.id, title: p.name, meta: p.position ?? "", href: p.href, face: p.face })),
    ...v.files.map((f) => ({ kind: "file" as const, id: f.id, title: f.title, meta: f.course, href: f.href })),
  ];
}
