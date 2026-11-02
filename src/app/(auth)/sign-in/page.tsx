import { getPlatform, isMobile } from "@/platform/server";
import { BottomBar } from "@/ui/shell/BottomBar";
import { GuestHero } from "@/ui/shell/GuestHero";
import { GuestSignIn } from "@/ui/shell/GuestSignIn";
import { SignInForm } from "@/ui/shell/SignInForm";

export const metadata = { title: "Sign in", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string }> };

/** Only same-site paths, so the form can't be used to bounce people elsewhere. */
const safeNext = (next?: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export default async function SignIn({ searchParams }: Props) {
  // Signed-in students may still open this to switch accounts.
  const [{ next: rawNext }, platform] = await Promise.all([searchParams, getPlatform()]);
  const next = safeNext(rawNext);

  if (isMobile(platform)) {
    // 1.3: the sign-in sheet over the guest home.
    return (
      <div className="sh-auth-mobile">
        <GuestHero />
        <GuestSignIn open next={next} />
        <BottomBar />
      </div>
    );
  }

  // D10 Welcome · sign in.
  return (
    <div className="sh-welcome">
      <section className="sh-welcome__pitch">
        <div className="sh-welcome__top">
          <div className="sh-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot.png" alt="" width={48} height={48} />
            <span>Press F</span>
          </div>
          <h1>Your semester,<br />without the LMS maze.</h1>
          <p className="sh-welcome__lede">Timetable, files by week, grades and absences — pulled from hero.study and kept up to date. Plus what students say about every course and teacher.</p>
          <ul className="sh-welcome__chips">
            <li>Next class, one glance</li>
            <li>Files sorted by week</li>
            <li>Absences left per course</li>
            <li>Press F for good teachers</li>
          </ul>
        </div>
        <p className="sh-welcome__foot">Built by a NewUU student, approved by the university. Not affiliated with hero.study.</p>
      </section>
      <section className="sh-welcome__form">
        <div className="sh-welcome__card">
          <SignInForm desktop next={next} />
        </div>
      </section>
    </div>
  );
}
