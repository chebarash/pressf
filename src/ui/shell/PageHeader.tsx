import Link from "next/link";

/**
 * The desktop page header standard (shell.css "Page header"): the title, the
 * subtitle beside it and the page's actions at the right end of the same row,
 * on the 32 line and 40 from the sidebar like Timetable. Every desktop screen
 * opens with it, split list panes included. `back` is a quiet keycap link that
 * sits with the actions (Progress, Professors, the course a file belongs to).
 */
export function PageHead({ title, sub, back, className, children }: { title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; className?: string; children?: React.ReactNode }) {
  return (
    <header className={className ? `pf-head ${className}` : "pf-head"}>
      <h1 className="pf-head__title">{title}</h1>
      {sub ? <p className="pf-head__sub">{sub}</p> : null}
      {(children || back) && (
        <div className="pf-head__actions">
          {children}
          {back && (
            <Link prefetch href={back.href} className="pf-head__back" data-key="Escape">
              <span aria-hidden>‹</span> {back.label}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * The title block under App/TopBar on mobile ("Today", t-mobile-title); on
 * desktop the PageHead standard, with the eyebrow folded into the subtitle.
 */
export function PageHeader({ title, eyebrow, subtitle, desktop, children }: { title: React.ReactNode; eyebrow?: string; subtitle?: React.ReactNode; desktop?: boolean; children?: React.ReactNode }) {
  if (desktop)
    return (
      <PageHead title={title} sub={eyebrow && subtitle ? <>{eyebrow} · {subtitle}</> : eyebrow || subtitle}>
        {children}
      </PageHead>
    );
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
        <div className="sh-skel" style={{ width: 150, height: 16 }} />
        <div className="sh-skel" style={{ width: 52, height: 52, borderRadius: 14 }} />
      </div>
    </div>
  );
}

/** A page of skeleton cards under a title (1.1 Launch · loading: 54px title, 16px between everything). */
export function SkeletonPage({ title, desktop }: { title: React.ReactNode; desktop?: boolean }) {
  if (desktop)
    return (
      <div role="status" aria-busy="true">
        <PageHeader title={String(title)} desktop />
        <div className="sh-placeholder" style={{ gap: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  return (
    <div className="sh-skel-page" role="status" aria-busy="true">
      <h1 className="sh-skel-page__title">{title}</h1>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
