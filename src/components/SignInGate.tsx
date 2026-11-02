/**
 * Placeholder shown to guests where files or course details would be. It is NOT
 * a blur over real content: the gated data is never sent to the browser, so
 * there is nothing to reveal with devtools. The skeleton bars are decorative.
 */
export function SignInGate({ title, note, lines = 4 }: { title: string; note?: string; lines?: number }) {
  return (
    <div className="gate">
      <div className="gate-skeleton" aria-hidden>
        {Array.from({ length: lines }).map((_, i) => (
          <span key={i} style={{ width: `${90 - (i % 3) * 20}%` }} />
        ))}
      </div>
      <div className="gate-overlay">
        <h3 className="d-sm">{title}</h3>
        {note && <p className="small soft" style={{ maxWidth: "40ch" }}>{note}</p>}
        <a className="key btn primary" href="/sign-in">Sign in with NewUU</a>
      </div>
    </div>
  );
}
