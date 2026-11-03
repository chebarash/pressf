import Link from "next/link";
import type { FileType } from "@/core/files";
import { ChevronRightIcon } from "../icons";
import { cx } from "./cx";
import { FILE_FLAG } from "./file-flag";
import s from "./FeedFiles.module.css";

export type FeedFilesProps = {
  /** At most three files, each with its File/Row type flag. */
  files: Array<{ id: string; title: string; type: FileType; typeLabel?: string; href?: string }>;
  /** How many more files the item announced ("and 7 more"). */
  more?: number;
  /** Where "and 7 more" goes (the course's files). */
  moreHref?: string | null;
  /** Off inside a row that is itself a button or a link (no nested links): the titles show without opening. */
  links?: boolean;
  className?: string;
};

/**
 * The files of a "new files" feed item (App/FeedItem, file type): a compact
 * File/Row list (flag, clean title, type), each opening the file, then "and N more".
 */
export function FeedFiles({ files, more = 0, moreHref, links = true, className }: FeedFilesProps) {
  return (
    <ul className={cx(s.list, className)}>
      {files.map((f) => {
        const body = (
          <>
            <span className={cx(s.flag, s[FILE_FLAG[f.type]])} aria-hidden />
            <span className={s.title}>{f.title}</span>
            {f.typeLabel ? <span className={s.type}>{f.typeLabel}</span> : null}
            {links && f.href ? <ChevronRightIcon size={16} className={s.chev} /> : null}
          </>
        );
        return (
          <li key={f.id}>
            {links && f.href ? (
              <Link href={f.href} className={cx(s.row, s.link)}>
                {body}
              </Link>
            ) : (
              <span className={s.row}>{body}</span>
            )}
          </li>
        );
      })}
      {more > 0 ? (
        <li>
          {links && moreHref ? (
            <Link href={moreHref} className={cx(s.more, s.link)}>
              and {more} more
            </Link>
          ) : (
            <span className={s.more}>and {more} more</span>
          )}
        </li>
      ) : null}
    </ul>
  );
}
