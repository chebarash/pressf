import Link from "next/link";
import { getCatalog, isStale } from "@/lib/catalog";
import type { CurrentUser } from "@/lib/auth";
import { Palette } from "./Palette";
import { ThemeToggle } from "./ThemeToggle";
import { Banner, Face } from "./ui";

export function Nav({ user, group }: { user: CurrentUser | null; group: string | null }) {
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Link href="/" className="serif logo">Press F</Link>
        <nav className="nav-links" aria-label="Main">
          <Link className="link" href="/schools">Schools</Link>
          <Link className="link" href="/courses">Courses</Link>
          <Link className="link" href="/professors">Professors</Link>
          <Link className="link" href="/files">Files</Link>
          <Link className="link" href="/calendar">Calendar</Link>
        </nav>
        <div className="row nav-tools">
          <Palette />
          <span className="hide-sm"><ThemeToggle /></span>
          {(group || user) && <Link className="chip small-chip" href="/me/group">{group ?? "Add group"}</Link>}
          {user ? <Link className="avatar" href="/me/ratings" aria-label="My ratings"><Face name="" src="/mascot.png" size={34} /></Link> : <Link className="key btn sm nav-sign" href="/sign-in">Sign in</Link>}
        </div>
      </div>
    </header>
  );
}

export async function StaleNotice() {
  const catalog = await getCatalog();
  if (!isStale(catalog)) return null;
  const date = catalog.updatedAt!.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return <div className="wrap" style={{ paddingTop: 8 }}><Banner tone="Warning">Timetable and teachers are from {date}. Our source is out of reach, so some details may be old.</Banner></div>;
}

export function Footer() {
  return (
    <footer className="wrap footer row between">
      <span className="d-xs serif">Made with love by <a className="link" href="https://chebarash.uz" target="_blank" rel="noreferrer">chebarash</a></span>
      <span className="small soft">Issues or ideas? <a className="link accent" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Reach out on Telegram</a>.<br />Data refreshes daily from the <a className="link accent" href="https://newuu.uz" target="_blank" rel="noreferrer">university</a> timetable.</span>
    </footer>
  );
}
