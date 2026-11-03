import Link from "next/link";
import { SearchIcon } from "../icons";
import { cx } from "./cx";
import { Face } from "./Face";
import s from "./TopBar.module.css";

export type TopBarProps = {
  /** Opens Search. */
  searchHref?: string;
  placeholder?: string;
  /** Opens Profile; omit for guests to hide the avatar. */
  profileHref?: string;
  /** Drawn face of the signed-in student (never a photo). */
  face?: string | null;
  className?: string;
};

/** Mobile in-app top row: search field + avatar (Figma App/TopBar 4156:2809). No logo, no menu. */
export function TopBar({ searchHref = "/search", placeholder = "Course, professor, file", profileHref, face, className }: TopBarProps) {
  return (
    <div className={cx(s.bar, className)}>
      <Link prefetch href={searchHref} className={s.search} aria-label="Search">
        <SearchIcon size={18} />
        <span className={s.placeholder}>{placeholder}</span>
      </Link>
      {profileHref ? (
        <Link prefetch href={profileHref} className={s.avatar} aria-label="Profile">
          <Face src={face} size={40} />
        </Link>
      ) : null}
    </div>
  );
}
