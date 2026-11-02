/**
 * The title block under App/TopBar on mobile ("Today", t-mobile-title) and at
 * the top of the desktop content column (t-display-md), with an optional
 * eyebrow ("Good morning, Shamsiddin") and subtitle ("Week 8 of 16").
 */
export function PageHeader({ title, eyebrow, subtitle, desktop, children }: { title: string; eyebrow?: string; subtitle?: React.ReactNode; desktop?: boolean; children?: React.ReactNode }) {
  return (
    <header className="sh-header">
      {eyebrow && <p className="sh-header__eyebrow">{eyebrow}</p>}
      <h1 className={desktop ? "t-display-md" : "t-mobile-title"}>{title}</h1>
      {subtitle && <p className="sh-header__sub">{subtitle}</p>}
      {children}
    </header>
  );
}

/** Loading card from 1.1 (App/SkeletonCard). */
export function SkeletonCard() {
  return (
    <div className="sh-skel-card" aria-hidden="true">
      <div className="sh-skel" style={{ width: 72, height: 24 }} />
      <div className="sh-skel" style={{ width: 220, height: 44 }} />
      <div />
      <div className="sh-skel-row">
        <div className="sh-skel" style={{ width: 44, height: 44, borderRadius: "50%" }} />
        <div className="sh-skel" style={{ flex: 1, height: 16, borderRadius: 999 }} />
        <div className="sh-skel" style={{ width: 52, height: 52, borderRadius: 14 }} />
      </div>
    </div>
  );
}

/** A page of skeleton cards under a title (1.1 Launch · loading). */
export function SkeletonPage({ title, desktop }: { title: string; desktop?: boolean }) {
  return (
    <div role="status" aria-label={`Loading ${title}`}>
      <PageHeader title={title} desktop={desktop} />
      <div className="sh-placeholder" style={{ gap: 16 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
