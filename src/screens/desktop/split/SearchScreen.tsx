"use client";

import Link from "next/link";
import { useState } from "react";
import { Chip, EmptyState } from "@/ui/components";
import type { SearchData } from "../model";
import { ButtonLink, css, cx, Hint, Icon, RatingStrip } from "../parts";
import x from "../search.module.css";

/** D14 Search (D17 when nothing is found). Results on the left, the selected course on the right. */
export function SearchScreen({ data }: { data: SearchData }) {
  const [only, setOnly] = useState<"all" | SearchData["groups"][number]["id"]>("all");
  const first = data.groups[0]?.items[0]?.id ?? null;
  const [selected, setSelected] = useState<string | null>(first);
  const groups = only === "all" ? data.groups : data.groups.filter((g) => g.id === only);
  const preview = selected ? data.previews[selected] : null;
  const typed = data.q.trim().length > 0;

  return (
    <main data-desktop-screen className={cx(css.screen, x.main)}>
      <form action="/search" className={x.bar} role="search">
        <Icon name="search" size={20} />
        <input name="q" defaultValue={data.q} placeholder="Search courses, professors and files" aria-label="Search" autoFocus={!typed} data-key="/" />
        {typed && <span className={x.count}>{data.total} {data.total === 1 ? "result" : "results"}</span>}
      </form>

      {data.groups.length > 0 && (
        <div className={css.chips} role="tablist" aria-label="Show">
          <Chip label={`All ${data.total}`} selected={only === "all"} onClick={() => setOnly("all")} />
          {data.groups.map((g) => (
            <Chip key={g.id} label={`${g.label} ${g.items.length}`} selected={only === g.id} onClick={() => setOnly(g.id)} />
          ))}
        </div>
      )}

      {typed && data.groups.length === 0 ? (
        <div className={x.nothing}>
          <EmptyState
            className={x.empty}
            title={`Nothing for “${data.q}”`}
            text={
              data.didYouMean ? (
                <>
                  Did you mean <Link href={`/search?q=${encodeURIComponent(data.didYouMean)}`} className={x.mean}>{data.didYouMean}</Link>? {data.suggestion}
                </>
              ) : (
                (data.suggestion ?? undefined)
              )
            }
          />
        </div>
      ) : (
        <div className={x.body}>
          <div className={cx(x.results, css.navList)} data-nav-list data-nav-arrows>
            {groups.map((g) => (
              <div key={g.id} className={x.results}>
                <p className={x.label}>{g.label}</p>
                {g.items.map((i) => (
                  <Link
                    key={g.id + i.id}
                    href={i.href}
                    className={cx(x.item, i.id === selected && x.itemOn)}
                    onMouseEnter={() => data.previews[i.id] && setSelected(i.id)}
                    onFocus={() => data.previews[i.id] && setSelected(i.id)}
                    data-nav-item
                  >
                    <span className={x.itemText}>
                      <span className={x.itemTitle}>{i.title}</span>
                      {i.meta && <span className={x.itemMeta}>{i.meta}</span>}
                    </span>
                    {i.right && <span className={x.right}>{i.right}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          {preview && (
            <aside className={cx(css.card, x.preview)} aria-label="Preview">
              <p className={x.eyebrow}>{preview.eyebrow}</p>
              <h2 className={x.previewTitle}>{preview.title}</h2>
              <RatingStrip strip={preview.strip} />
              {preview.text && <p className={x.previewText}>{preview.text}</p>}
              <div className={x.open}>
                <ButtonLink href={preview.href} size="s" keyName="Enter">
                  Open course
                </ButtonLink>
                <Hint>↵</Hint>
              </div>
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
