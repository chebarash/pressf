import { Skeleton } from "@/ui/components";
import { PageHead } from "@/ui/shell/PageHeader";
import c from "./course/course.module.css";
import l from "./loading.module.css";
import n from "./notifications.module.css";
import { css, cx } from "./parts";

/**
 * Desktop loading states. The sidebar stays (it lives in the layout); only the
 * content column is replaced, in the shape of the screen that is coming (D15:
 * the frame paints, sunken blocks stand in for the data).
 */

const Block = (p: { w?: number | string; h: number; r?: "sm" | "md" | "lg" | "full"; sunken?: boolean }) => (
  <Skeleton width={p.w ?? "100%"} height={p.h} radius={p.r ?? "md"} className={p.sunken ? l.onSunken : undefined} />
);

/** D1 Today: header, next class + your day, then the feed + due soon. */
export function TodayLoading() {
  return (
    <div data-desktop-screen className={cx(css.screen, l.page)} role="status" aria-busy="true" aria-label="Loading Today">
      <PageHead title="Today">
        <Block w={260} h={16} r="sm" />
      </PageHead>
      <section className={l.row}>
        <div className={cx(l.card, l.cardAccent)} style={{ minHeight: 210 }}>
          <Block w={140} h={14} r="sm" />
          <Block w="55%" h={52} />
          <Block w="70%" h={16} r="sm" />
          <div className={l.line}>
            <Block w="calc(50% - 6px)" h={52} />
            <Block w="calc(50% - 6px)" h={52} />
          </div>
        </div>
        <div className={l.card}>
          <h2 className={l.cardTitle}>Your day</h2>
          {[0, 1, 2, 3].map((i) => (
            <Block key={i} h={36} />
          ))}
        </div>
      </section>
      <section className={l.row}>
        <div className={l.card}>
          <h2 className={l.cardTitle}>Notifications</h2>
          {[0, 1, 2, 3].map((i) => (
            <Block key={i} h={56} />
          ))}
        </div>
        <div className={l.col}>
          <div className={l.card}>
            <h2 className={l.cardTitle}>Due soon</h2>
            <Block h={40} />
            <Block h={40} />
          </div>
        </div>
      </section>
    </div>
  );
}

/** The D4 list pane (Courses, filter, semesters, your courses). */
function CourseListLoading() {
  return (
    <div className={c.list} aria-hidden>
      <PageHead title="Courses" />
      <Block h={38} r="md" sunken />
      <div className={l.chips}>
        <Block w={52} h={28} r="full" sunken />
        <Block w={84} h={28} r="full" sunken />
        <Block w={64} h={28} r="full" sunken />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <Block key={i} h={72} sunken />
      ))}
    </div>
  );
}

/** D4 Courses / a course: list · detail · inspector. */
export function CourseLoading({ list = true }: { list?: boolean }) {
  return (
    <div data-desktop-screen className={cx(css.screen, c.layout, !list && c.layoutNoList)} role="status" aria-busy="true" aria-label="Loading course">
      {list && <CourseListLoading />}
      <div className={c.detail}>
        <div className={c.head}>
          <div className={l.line}>
            <Block w="40%" h={50} />
            <Block w={72} h={24} r="sm" />
            <Block w={48} h={24} r="sm" />
          </div>
          <Block w={180} h={39} r="full" />
          <div className={l.line}>
            <Block w={150} h={34} r="full" />
            <Block w={96} h={34} r="full" />
            <Block w={96} h={34} r="full" />
          </div>
        </div>
        <div className={l.tabs}>
          <Block w={104} h={44} r="full" />
          <Block w={80} h={44} r="full" />
          <Block w={120} h={44} r="full" />
        </div>
        <section className={c.section}>
          <h2 className={l.section}>Week by week</h2>
          <Block w={358} h={48} />
          <Block h={52} />
          <Block h={64} />
          <Block h={64} />
        </section>
        <section className={c.section}>
          <h2 className={l.section}>Who teaches it</h2>
          <Block h={140} r="lg" />
        </section>
      </div>
      <div className={c.inspector} aria-hidden>
        <Block h={110} r="lg" />
        <Block h={280} r="lg" />
        <Block w={200} h={50} r="md" />
      </div>
    </div>
  );
}

/** D7 Notifications: list on the left, the reading pane on the right. */
export function NotificationsLoading() {
  return (
    <div data-desktop-screen className={cx(css.screen, n.split)} role="status" aria-busy="true" aria-label="Loading notifications">
      <div className={n.list} aria-hidden>
        <PageHead title="Notifications" />
        <div className={l.chips}>
          {[40, 52, 64, 76, 50, 96].map((w, i) => (
            <Block key={i} w={w} h={30} r="full" sunken />
          ))}
        </div>
        <Block w={48} h={12} r="sm" sunken />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Block key={i} h={66} r="lg" sunken />
        ))}
      </div>
      <div className={n.detail} aria-hidden>
        <Block w={260} h={12} r="sm" />
        <Block w="80%" h={52} />
        <Block h={18} r="sm" />
        <Block w="90%" h={18} r="sm" />
        <Block w="60%" h={18} r="sm" />
        <div className={l.line}>
          <Block w={110} h={50} />
          <Block w={170} h={50} />
        </div>
      </div>
    </div>
  );
}

/** Any other desktop screen: its title over a few cards. */
export function PageLoading({ title }: { title: string }) {
  return (
    <div data-desktop-screen className={cx(css.screen, l.page)} role="status" aria-busy="true" aria-label={`Loading ${title}`}>
      <PageHead title={title}>
        <Block w={240} h={16} r="sm" />
      </PageHead>
      <div className={l.grid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={l.card} style={{ minHeight: 150 }}>
            <Block w={72} h={20} r="sm" />
            <Block w="70%" h={28} />
            <Block w="50%" h={14} r="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

const TITLES: Array<[RegExp, string]> = [
  [/^\/timetable/, "Timetable"],
  [/^\/next/, "Next semester"],
  [/^\/progress/, "Progress"],
  [/^\/professors|^\/p\//, "Professors"],
  [/^\/programs|^\/schools/, "Curriculum"],
  [/^\/search/, "Search"],
  [/^\/rate/, "Rate"],
  [/^\/me/, "Settings"],
  [/^\/qr/, "Scan QR"],
];

/** Picks the skeleton of the screen at `pathname`. */
export function DesktopLoading({ pathname }: { pathname: string }) {
  if (pathname === "/") return <TodayLoading />;
  if (/^\/(courses|c\/|f\/)/.test(pathname)) return <CourseLoading />;
  if (pathname.startsWith("/notifications")) return <NotificationsLoading />;
  return <PageLoading title={TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Loading"} />;
}
