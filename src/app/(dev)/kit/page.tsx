import type { ReactNode } from "react";
import type { FileFormat } from "@/core/files";
import {
  Banner,
  BottomButtons,
  Button,
  Chip,
  CourseCard,
  EmptyState,
  Face,
  FeedItem,
  FileRow,
  FileThumbnail,
  Keycap,
  MainButton,
  QuickTile,
  RatingStrip,
  RatingSummary,
  Score,
  SkeletonCard,
  Skeleton,
  Switch,
  SwitchGroup,
  Tab,
  Tabs,
  Tag,
  TextField,
  Toast,
  TopBar,
  pctTier,
  type FeedType,
  type ForcedState,
  type TagTone,
} from "@/ui/components";
import { icons, CalendarIcon, QrIcon, CheckIcon } from "@/ui/icons";
import { Demos } from "./Demos";
import { ThemeToggle } from "./ThemeToggle";
import s from "./kit.module.css";

const STATES: Array<[string, { state?: ForcedState; disabled?: boolean; loading?: boolean }]> = [
  ["Default", {}],
  ["Hover", { state: "hover" }],
  ["Pressed", { state: "pressed" }],
  ["Focus", { state: "focus" }],
  ["Loading", { loading: true }],
  ["Disabled", { disabled: true }],
];

function Section({ title, node, children }: { title: string; node: string; children: ReactNode }) {
  return (
    <section className={s.section} id={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
      <h2 className="t-display-xs">
        {title} <span className={s.node}>{node}</span>
      </h2>
      {children}
    </section>
  );
}

const Row = ({ children, label, top }: { children: ReactNode; label?: string; top?: boolean }) => (
  <div className={top ? `${s.row} ${s.top}` : s.row}>
    {label ? <span className={s.rowLabel}>{label}</span> : null}
    {children}
  </div>
);

export default function KitPage() {
  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1 className="t-mobile-title">UI kit</h1>
        <ThemeToggle />
      </header>

      <Section title="Icons" node="4007:1002">
        <Row>
          {Object.entries(icons).map(([name, I]) => (
            <span key={name} className={s.icon}>
              <I size={24} />
              <small>{name}</small>
            </span>
          ))}
        </Row>
      </Section>

      <Section title="Button" node="4007:1221">
        {(["ghost", "primary", "secondary"] as const).map((variant) =>
          (["m", "s"] as const).map((size) => (
            <Row key={variant + size} label={`${variant} ${size.toUpperCase()}`}>
              {STATES.map(([name, p]) => (
                <Button key={name} variant={variant} size={size} label="Download" icon {...p} />
              ))}
            </Row>
          )),
        )}
      </Section>

      <Section title="Keycap" node="4007:1110">
        {(["l", "m", "s"] as const).map((size) => (
          <Row key={size} label={size.toUpperCase()}>
            <Keycap size={size} label="F" />
            <Keycap size={size} label="F" state="hover" />
            <Keycap size={size} label="F" state="pressed" />
            <Keycap size={size} label="F" selected />
            <Keycap size={size} label="F" state="focus" />
            <Keycap size={size} label="F" disabled />
          </Row>
        ))}
      </Section>

      <Section title="Chip" node="4007:1260">
        {(["m", "s"] as const).map((size) => (
          <Row key={size} label={size.toUpperCase()}>
            <Chip size={size} label="Calculus 1" removable />
            <Chip size={size} label="Calculus 1" removable state="hover" />
            <Chip size={size} label="Calculus 1" removable selected />
            <Chip size={size} label="Calculus 1" removable state="focus" />
            <Chip size={size} label="Calculus 1" removable disabled />
          </Row>
        ))}
      </Section>

      <Section title="Tag" node="4007:1287">
        <Row>
          {(["neutral", "accent", "computing", "engineering", "management", "humanities", "medicine", "dark"] as TagTone[]).map((t) => (
            <Tag key={t} tone={t}>
              Midterm
            </Tag>
          ))}
        </Row>
      </Section>

      <Section title="Face" node="4007:1296">
        <Row>
          <Face src="/ui/face-sample.png" size={96} name="Gonçalo Pinto" />
          <Face size={96} />
          <Face kind="mascot" size={96} />
          <Face src="/ui/face-sample.png" size={40} />
          <Face src="/ui/face-sample.png" size={28} />
        </Row>
      </Section>

      <Section title="Score" node="4008:1068">
        {(["s", "m", "l"] as const).map((size) => (
          <Row key={size} label={size.toUpperCase()}>
            <Score size={size} value="84%" tier={pctTier(84)} />
            <Score size={size} value="62%" tier={pctTier(62)} />
            <Score size={size} value="31%" tier={pctTier(31)} />
            <Score size={size} value="—" tier={pctTier(null)} label="Not enough ratings yet" />
          </Row>
        ))}
      </Section>

      <Section title="Tabs" node="4008:1433">
        <Row>
          <Tab label="Files" />
          <Tab label="Files" active />
          <Tab label="Files" state="hover" />
          <Tab label="Files" state="focus" />
        </Row>
        <div className={s.phone}>
          <Tabs label="Day" size="l" spread items={["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => ({ label: d, href: `#${d}`, active: i === 0 }))} />
        </div>
      </Section>

      <Section title="Banner" node="4024:1232">
        <div className={s.phone}>
          <Banner action={{ label: "Compare", href: "#" }}>Cohort selection opens Monday 9 Nov. See how students rate each teacher before you pick.</Banner>
          <Banner tone="warning" action={{ label: "Open LMS", href: "#" }}>
            Add/drop closes tonight at 23:59.
          </Banner>
        </div>
      </Section>

      <Section title="Toast" node="9.4 · 4198:7453">
        <div className={s.phone}>
          <Toast>Rating sent. Thanks — it&apos;s anonymous.</Toast>
          <Toast>Marked present · Physics 1</Toast>
          <Toast tone="error">Couldn&apos;t reach LMS. Try again in a minute.</Toast>
        </div>
      </Section>

      <Section title="EmptyState" node="4008:1548">
        <EmptyState title="Nothing here yet" text="The channel has not uploaded files for this course. Got some?" action={<Button variant="secondary" label="Send on Telegram" icon />} />
      </Section>

      <Section title="Skeleton" node="4018:1509">
        <Row top>
          <SkeletonCard className={s.w384} />
          <div className={s.phone}>
            <Skeleton height={56} radius="md" />
            <Skeleton width="60%" height={20} />
            <Skeleton height={64} radius="md" />
          </div>
        </Row>
      </Section>

      <Section title="App/TopBar" node="4156:2809">
        <div className={s.phone390}>
          <TopBar profileHref="#" face={null} />
        </div>
      </Section>

      <Section title="File/Row v2" node="4153:2357">
        <div className={s.phone}>
          {(["exam", "mock", "lecture", "notes", "syllabus"] as const).map((t) => (
            <FileRow key={t} title="Midterm exam" type={t} course="Calculus 1" week="Week 7" date="Fall 2023" source={{ label: "Channel", kind: "channel" }} href="#" />
          ))}
          <FileRow title="Lecture 15 slides" type="lecture" date="2 Nov" source={{ label: "LMS", kind: "lms" }} />
        </div>
      </Section>

      <Section title="File/Thumbnail" node="4254:45260">
        <div className={s.thumbs}>
          {(["pdf", "word", "slides", "sheet", "image", "video", "audio", "archive", "code", "link", "other"] as FileFormat[]).map((f) => (
            <div key={f} className={s.thumbPair}>
              <FileThumbnail format={f} title="Limits and continuity" meta="MATH 111 · Week 2" pages="12 p" />
              <FileThumbnail format={f} size="s" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="App/FeedItem" node="4180:7810">
        <div className={s.phone}>
          {(["announcement", "grade", "absence", "files", "deadline", "room", "anonymous"] as FeedType[]).map((t, i) => (
            <FeedItem key={t} type={t} title="Title" meta="Meta" unread={i < 6} href="#" />
          ))}
        </div>
      </Section>

      <Section title="App/CourseCard" node="4203:7775">
        <Row>
          <CourseCard className={s.w358} code="MATH111" name="Calculus 1" teacher={{ name: "Gonçalo Pinto" }} line="Mon, Wed 10:00 · B-204" recommend={{ pct: 84, split: { yes: 84, unsure: 9, no: 7 } }} href="#" />
          <CourseCard className={s.w358} code="PHYS101" name="Physics 1" teacher={{ name: "Aziza Karimova" }} line="≈ 6 h · Hard-ish" />
        </Row>
      </Section>

      <Section title="App/QuickTile v2" node="4208:8113">
        <Row>
          <QuickTile label="Timetable" info="Next 10:00" href="#" />
          <QuickTile label="Scan QR" info="Physics 1 now" tone="accent" icon={<QrIcon size={18} />} href="#" />
          <QuickTile label="Progress" info="2 absences left" tone="warning" icon={<CheckIcon size={18} />} href="#" />
          <QuickTile label="Calendar" info="Exams 9 Nov" icon={<CalendarIcon size={18} />} href="#" />
        </Row>
      </Section>

      <Section title="App/RatingStrip" node="4199:7448">
        <div className={s.phone}>
          <RatingStrip recommend={{ pct: 84, split: { yes: 84, unsure: 9, no: 7 } }} hours={6} difficulty={{ value: 3.2, word: "Hard-ish" }} href="#ratings" />
        </div>
      </Section>

      <Section title="App/RatingSummary" node="4192:7566">
        <Row top>
          <RatingSummary
            className={s.w358}
            byline="By 63 students · Fall 2024 – Fall 2026"
            stats={[
              { value: "84%", label: "recommend", tone: "accent" },
              { value: "6 h", label: "a week" },
              { value: "4/5", label: "hard", tone: "low" },
            ]}
            trend={{ title: "Recommend by semester", delta: "↑ 13 since F24", points: [{ label: "F24", value: 71 }, { label: "S25", value: 76 }, { label: "F25", value: 81 }, { label: "S26", value: 79 }, { label: "F26", value: 84 }] }}
            tags={[{ label: "Exam follows lectures", pct: 71 }, { label: "Useful later", pct: 58 }, { label: "Strict attendance", pct: 44 }]}
          />
          <RatingSummary
            className={s.w358}
            byline="By 128 students · all semesters"
            stats={[
              { value: "91%", label: "pressed F", tone: "accent" },
              { value: "3", label: "courses" },
              { value: "5", label: "years here" },
            ]}
            trend={{ title: "Pressed F by semester", delta: "↑ 5 since F24", points: [{ label: "F24", value: 86 }, { label: "S25", value: 88 }, { label: "F25", value: 87 }, { label: "S26", value: 90 }, { label: "F26", value: 91 }] }}
            tags={[{ label: "Explains clearly", pct: 78 }, { label: "Answers questions", pct: 66 }, { label: "Grades fairly", pct: 52 }]}
            byCourse={[{ label: "Precalculus · lectures", pct: 93 }, { label: "Calculus 1 · lectures", pct: 84 }, { label: "Calculus 2 · tutorials", pct: 88 }]}
          />
        </Row>
      </Section>

      <Section title="TG/MainButton (web)" node="4164:3243">
        <div className={s.phone390}>
          <MainButton label="Rate this course" />
          <MainButton label="Rate this course" state="loading" />
          <MainButton label="Rate this course" state="disabled" />
          <MainButton label="Rate this course" state="shine" />
        </div>
      </Section>

      <Section title="TG/BottomButtons (web)" node="4172:5985">
        <div className={s.phone390}>
          <BottomButtons secondary={{ label: "Later" }} main={{ label: "Rate now" }} />
        </div>
      </Section>

      <Section title="TextField" node="1.3 / 1.5">
        <div className={s.phone}>
          <TextField label="Email" type="email" defaultValue="s.student@newuu.uz" />
          <TextField label="Password" type="password" defaultValue="secretpass" error="Wrong email or password. Use the ones from hero.study." />
          <TextField label="Disabled" disabled defaultValue="read only" />
        </div>
      </Section>

      <Section title="Switch" node="8.5">
        <div className={s.phone}>
          <SwitchGroup>
            <Switch label="Morning digest" description="07:30 on school days" defaultChecked />
            <Switch label="Class reminders" description="15 minutes before" defaultChecked />
            <Switch label="Replies on Anonymous" description="Your posts only" />
            <Switch label="Disabled" description="Not available" disabled />
          </SwitchGroup>
        </div>
      </Section>

      <Section title="Sheet / Dialog" node="3.2 · D5">
        <Demos />
      </Section>
    </main>
  );
}
