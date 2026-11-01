import Link from "next/link";
import type { ReactNode } from "react";
import { tierOf } from "@/lib/ratings";

export const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
);

/** Course codes can hold characters a view transition name cannot. */
export const viewName = (code: string) => code.replace(/[^\w-]/g, "");

export function Score({ value, size = "" }: { value?: number | null; size?: "" | "md" }) {
  const shown = value == null || Number.isNaN(value) ? null : value;
  return (
    <span className={`score ${size} ${tierOf(shown)}`} title={shown == null ? "No ratings yet" : undefined}>
      {shown == null ? "–" : shown.toFixed(1)}
    </span>
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
