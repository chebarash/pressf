import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeScreenButton } from "@/components/HomeScreenButton";
import { Empty, Stat } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { lmsProfile } from "@/lib/lms/profile";

export const metadata = { title: "My profile", robots: { index: false } };

export default async function Me() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const profile = await lmsProfile(user.id, user.email);

  return (
    <div className="wrap section">
      <div className="row between" style={{ alignItems: "start" }}>
        <div>
          <h1 className="d-title">{profile?.name ?? user.email}</h1>
          <p className="soft">{user.email} · Your record from the university LMS. Only you can see this.</p>
        </div>
        <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
          <HomeScreenButton />
          <Link className="key btn sm" href="/api/auth/signout">Sign out</Link>
        </div>
      </div>

      {!profile ? (
        <Empty title="Could not reach the LMS" action={<Link className="key btn" href="/sign-in">Sign in again</Link>}>
          Your saved login may have expired. Sign in again to refresh your record.
        </Empty>
      ) : (
        <>
          {(profile.gpa != null || profile.ectsEarned != null) && (
            <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}>
              {profile.gpa != null && <Stat value={profile.gpa.toFixed(2)} label="GPA" />}
              {profile.ectsEarned != null && <Stat value={profile.ectsTotal != null ? `${profile.ectsEarned}/${profile.ectsTotal}` : profile.ectsEarned} label="ECTS earned" />}
              {profile.honors && <Stat value="Yes" label="On track for honours" />}
            </div>
          )}

          <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
            <Link className="key btn sm" href="/me/ratings">My ratings</Link>
            <Link className="key btn sm" href="/me/group">My group</Link>
          </div>

          {profile.semesters.length === 0 ? (
            <Empty title="No grades yet">Your grades will appear here once the semester is graded in the LMS.</Empty>
          ) : (
            <div className="stack" style={{ "--gap": "32px" } as React.CSSProperties}>
              {profile.semesters.map((sem) => (
                <section key={sem.name} className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
                  <div className="row between">
                    <h2 className="d-sm">{sem.name}</h2>
                    {sem.open && <span className="small soft">In progress</span>}
                  </div>
                  <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                    {sem.courses.map((course) => (
                      <div key={course.name} className="row between" style={{ flexWrap: "nowrap" }}>
                        <span className="grow">{course.name}</span>
                        {course.mark != null && (
                          <span className="num" style={{ fontWeight: 600, color: `var(--${course.passed ? "high" : "low"})` }}>{course.mark}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
