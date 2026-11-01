import Link from "next/link";
import { getCatalog, isStale } from "@/lib/catalog";
import type { CurrentUser } from "@/lib/auth";
import { Palette } from "./Palette";
import { ThemeToggle } from "./ThemeToggle";
import { Banner } from "./ui";

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
          {group && <Link className="link accent" href="/me">My semester</Link>}
        </nav>
        <div className="row nav-tools">
          <Palette />
          <ThemeToggle />
          <Link className="chip nav-chip" href="/me/group">{group ?? "Add group"}</Link>
          {user ? <Link className="key btn sm" href="/me/ratings">Me</Link> : <Link className="key btn sm" href="/sign-in">Sign in</Link>}
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
      <span className="label">Made with love by chebarash</span>
      <span className="small soft">Issues or ideas? Reach out on Telegram.</span>
    </footer>
  );
}
