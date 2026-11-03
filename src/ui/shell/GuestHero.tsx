/**
 * 1.2 Guest home hero: "Press [F] to pay respects" over the salute photo,
 * faded into the page colour. Screen agents put the guest content under it.
 */
export function GuestHero() {
  return (
    <section className="sh-hero" aria-labelledby="sh-hero-title">
      <div className="sh-hero__bg" aria-hidden="true" />
      <div className="sh-hero__inner">
        <h1 id="sh-hero-title" className="sh-hero__title">
          <span className="sh-hero__row">Press <span className="sh-keycap" aria-label="F">F</span></span>
          <span>to pay</span>
          <em>respects</em>
        </h1>
        <p className="sh-hero__text">Not all heroes wear capes… Some just teach really well. Everything about NewUU courses, from the people who took them.</p>
      </div>
    </section>
  );
}
