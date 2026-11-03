import Link from "next/link";
import { notFound } from "next/navigation";
import Assignments from "@/screens/mobile/Assignments";
import CourseProgress from "@/screens/mobile/CourseProgress";
import Calendar from "@/screens/mobile/Calendar";
import Alerts from "@/screens/mobile/Alerts";
import Curriculum from "@/screens/mobile/Curriculum";
import { assignmentsDemo, CALENDAR, courseProgressDemo, curriculumDemo, myRatingsDemo, PROFESSOR, professorsDemo, profileDemo, PROGRESS, RECENT, schoolsDemo, SEARCH } from "@/screens/mobile/mc/demo";
import MyRatings from "@/screens/mobile/MyRatings";
import Settings from "@/screens/mobile/Settings";
import Professors from "@/screens/mobile/Professors";
import Schools from "@/screens/mobile/Schools";
import Professor from "@/screens/mobile/Professor";
import Search from "@/screens/mobile/Search";
import Progress from "@/screens/mobile/Progress";
import { Shell } from "@/ui/shell/Shell";

/**
 * Dev-only preview of the Figma states of Progress, Calendar, Search, People
 * and Profile on fixtures: /screens/mc?state=5.1 (add &theme=dark).
 */

type Props = { searchParams: Promise<{ state?: string; theme?: string }> };

const STATES: Record<string, () => React.ReactNode> = {
  ...Object.fromEntries(Object.entries(PROGRESS).map(([k, v]) => [k, () => <Progress data={v()} />])),
  "5.2": () => <CourseProgress data={courseProgressDemo()} behind={PROGRESS["5.1"]()} />,
  "5.4": () => <Assignments data={assignmentsDemo()} />,
  "6.1": () => <Calendar data={CALENDAR["6.1"]()} />,
  "6.2": () => <Calendar data={CALENDAR["6.2"]()} />,
  "6.3": () => <Calendar data={CALENDAR["6.1"]()} subscribed />,
  ...Object.fromEntries(Object.entries(SEARCH).map(([k, v]) => [k, () => <Search data={v()} />])),
  ...Object.fromEntries(Object.entries(PROFESSOR).map(([k, v]) => [k, () => <Professor data={v()} />])),
  "7.6": () => <Curriculum data={curriculumDemo()} base="/programs/p2/curriculum" year={1} course="MATH111" />,
  "7.7": () => <Professors data={professorsDemo()} />,
  "7.8": () => <Schools data={schoolsDemo()} />,
  "8.1": () => <Settings data={profileDemo()} />,
  "8.5": () => <Alerts data={profileDemo()} />,
  "8.6": () => <MyRatings data={myRatingsDemo()} />,
};

export default async function Preview({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state, theme } = await searchParams;
  const seed = `try{localStorage.setItem("pf:recent-search",${JSON.stringify(JSON.stringify(RECENT))})}catch(e){}`;
  const themeScript = (
    <script dangerouslySetInnerHTML={{ __html: `${theme ? `document.documentElement.dataset.theme=${JSON.stringify(theme === "dark" ? "dark" : "light")};` : ""}${seed}` }} />
  );
  const render = state ? STATES[state] : undefined;
  if (render)
    return (
      <>
        {themeScript}
        <Shell>{render()}</Shell>
      </>
    );
  return (
    <ul style={{ padding: 24, display: "grid", gap: 8 }}>
      {Object.keys(STATES).sort().map((s) => (
        <li key={s}>
          <Link href={`?state=${s}`}>{s}</Link> · <Link href={`?state=${s}&theme=dark`}>dark</Link>
        </li>
      ))}
    </ul>
  );
}
