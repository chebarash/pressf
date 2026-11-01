import Link from "next/link";
import type { ReactNode } from "react";
import { tierOf } from "@/lib/criteria";

export const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
);

/** Course codes can hold characters a view transition name cannot. */
export const viewName = (code: string) => code.replace(/[^\w-]/g, "");

export function Score({ value, size = "" }: { value?: number | null; size?: "" | "md" | "lg" }) {
  const shown = value == null || Number.isNaN(value) ? null : value;
  return (
    <span className={`score ${size} ${tierOf(shown)}`} title={shown == null ? "No ratings yet" : undefined}>
      {shown == null ? "–" : shown.toFixed(1)}
    </span>
  );
}

const icon = (path: string, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
);
export const Icons = {
  search: (size?: number) => icon("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.300-4.300", size),
  send: (size?: number) => icon("M22 2 11 13M22 2l-7 20-4-9-9-4z", size),
  external: (size?: number) => icon("M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", size),
  clock: (size?: number) => icon("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", size),
  pin: (size?: number) => icon("M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", size),
  mail: (size?: number) => icon("M4 4h16v16H4zM22 6l-10 7L2 6", size),
  file: (size?: number) => icon("M14 2H6v20h12V6zM14 2v4h4", size),
  users: (size?: number) => icon("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.900M16 3.100a4 4 0 0 1 0 7.800", size),
};

export function Crumbs({ items }: { items: Array<[string, string?]> }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumbs">
      {items.map(([label, href]) => (href ? <Link key={label} href={href}>{label}</Link> : <span key={label} aria-current="page">{label}</span>))}
    </nav>
  );
}

/** A list page's own search. The F key lands here instead of opening the palette. */
export function PageSearch({ placeholder, label, name = "q", value, children }: { placeholder: string; label: string; name?: string; value: string; children?: ReactNode }) {
  return (
    <form className="search page-search" style={{ cursor: "text" }}>
      {Icons.search(24)}
      <input data-page-search name={name} defaultValue={value} placeholder={placeholder} aria-label={label} autoComplete="off" />
      {children}
      <span className="small soft hide-sm">press</span>
      <span className="key cap sm hide-sm" aria-hidden="true" style={{ marginBottom: 0 }}>F</span>
    </form>
  );
}

export function Face({ src, name, size = 56, className = "" }: { src?: string | null; name: string; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`face ${className}`} src={src ?? "/pfp.png"} alt={name} width={size} height={size} loading="lazy" />;
}

export const Tag = ({ tone = "", children }: { tone?: string; children: ReactNode }) => <span className={`tag ${tone}`}>{children}</span>;

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <div className="d-sm num serif">{value}</div>
      <div className="small soft">{label}</div>
    </div>
  );
}

export function SectionHead({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="row between">
      <h2 className="d-md">{title}</h2>
      {href && <Link className="ghost" href={href}>{action}<Arrow /></Link>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="stack" style={{ justifyItems: "center", textAlign: "center", padding: "32px 0" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascot.png" alt="" width={120} height={120} />
      <h3 className="d-xs">{title}</h3>
      <p className="soft" style={{ maxWidth: "44ch" }}>{children}</p>
      {action}
    </div>
  );
}

export function Banner({ tone = "Info", children, href, action }: { tone?: string; children: ReactNode; href?: string; action?: string }) {
  return (
    <div className={`banner ${tone}`}>
      <span>{children}</span>
      {href && <Link href={href}>{action}</Link>}
    </div>
  );
}

export const tags: Record<string, string> = { syllabus: "", midterm: "accent-tag", final: "accent-tag", mock: "warm", notes: "", textbook: "warm" };
