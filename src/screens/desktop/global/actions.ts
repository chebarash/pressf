"use server";

import { getUser } from "@/lib/auth";
import { search } from "@/server/views";

export type PaletteHit = { kind: "course" | "person" | "file"; id: string; title: string; meta: string; href: string };

/** The palette's results, from the same search view as /search (Postgres only). */
export async function paletteSearch(q: string): Promise<PaletteHit[]> {
  const query = q.trim().slice(0, 80);
  if (!query) return [];
  const user = await getUser();
  const v = await search(query, user ? { userId: user.id } : null, { courses: 4, people: 3, files: 3 });
  return [
    ...v.courses.map((c) => ({ kind: "course" as const, id: c.code, title: c.name, meta: [c.code, c.recommendPct != null && `${c.recommendPct}% recommend`].filter(Boolean).join(" · "), href: c.href })),
    ...v.people.map((p) => ({ kind: "person" as const, id: p.id, title: p.name, meta: p.position ?? "", href: p.href })),
    ...v.files.map((f) => ({ kind: "file" as const, id: f.id, title: f.title, meta: f.course, href: f.href })),
  ];
}
