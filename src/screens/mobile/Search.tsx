import Link from "next/link";
import type { SearchView } from "@/server/views";
import { ArrowRightIcon, EmptyState, Face, FileIcon } from "./mc/kit";
import { Chevron, cx, Screen } from "./mc/parts";
import { RecentSearches, RememberHits, type RecentHit } from "./mc/RecentSearches";
import { SearchBar } from "./mc/SearchBar";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

type Hit = RecentHit & { key: string };

/** Mobile Search (Figma 7.1 before typing, 7.2 results, 7.3 nothing found). */
export default function Search({ data, programHref = "/schools" }: { data: SearchView; programHref?: string }) {
  const groups: Array<[string, Hit[]]> = (
    [
      ["Courses", data.courses.map((k) => ({ kind: "course", key: k.code, title: k.name, subtitle: [k.code, k.recommendPct !== null ? `${k.recommendPct}% recommend` : null].filter(Boolean).join(" · "), href: k.href }))],
      ["People", data.people.map((p) => ({ kind: "person", key: p.id, title: p.name, subtitle: p.position ?? "Teacher", href: p.href }))],
      ["Files", data.files.map((f) => ({ kind: "file", key: f.id, title: f.title, subtitle: f.course, href: f.href }))],
    ] as Array<[string, Hit[]]>
  ).filter(([, hits]) => hits.length);
  const first = groups[0]?.[1][0] ?? null;
  const browse = [
    { label: "Curriculum of your program", href: programHref },
    { label: "Schools and programs", href: "/schools" },
    { label: "All professors", href: "/professors" },
  ];
  return (
    <Screen className={s.noTopBar}>
      <SearchBar query={data.q} first={first?.href ?? null} />
      {data.nothing ? (
        <div className={c.results}>
          <EmptyState title={`Nothing for “${data.q}”`} text="Try a course code like PHYS101 or a teacher's surname." />
        </div>
      ) : data.q ? (
        <RememberHits className={c.results}>
          {groups.map(([title, hits]) => (
            <section key={title} className={c.block8} aria-label={title}>
              <h2 className={cx(c.groupLabel, "t-label-xs")}>{title}</h2>
              {hits.map((h) => (
                <HitRow key={`${h.kind}:${h.key}`} hit={h} active={h === first} />
              ))}
            </section>
          ))}
        </RememberHits>
      ) : (
        <div className={c.results}>
          <RecentSearches />
          <h2 className={cx(s.caps, s.p0)}>Browse</h2>
          {browse.map((b) => (
            <Link key={b.label} href={b.href} prefetch className={c.browse}>
              <span>{b.label}</span>
              <Chevron />
            </Link>
          ))}
        </div>
      )}
    </Screen>
  );
}

function HitRow({ hit, active }: { hit: Hit; active?: boolean }) {
  const remembered: RecentHit = { kind: hit.kind, title: hit.title, subtitle: hit.subtitle, href: hit.href };
  return (
    <Link href={hit.href} prefetch={false} className={cx(c.hit, active && c.hitActive)} data-hit={JSON.stringify(remembered)}>
      {hit.kind === "person" ? <Face size={48} /> : null}
      {hit.kind === "file" ? (
        <span className={c.fileIcon} aria-hidden>
          <FileIcon size={20} />
        </span>
      ) : null}
      <div className={s.lines} style={{ gap: 0 }}>
        <p className={c.hitTitle}>{hit.title}</p>
        <p className={c.hitSub}>{hit.subtitle}</p>
      </div>
      {active ? <ArrowRightIcon size={20} aria-hidden /> : null}
    </Link>
  );
}
