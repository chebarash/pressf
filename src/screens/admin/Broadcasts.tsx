"use client";

import { useEffect, useState, useTransition } from "react";
import { countAudience, scheduleBroadcast, sendTestBroadcast } from "@/app/admin/actions";
import { inQuietHours, nextSendable, type Audience } from "@/server/admin/rules";
import type { broadcastsPage } from "@/server/admin/views";
import { Btn, Label, cx, s } from "./ui";
import { useKeys } from "./useKeys";

export type BroadcastsData = Awaited<ReturnType<typeof broadcastsPage>>;

const BUTTONS = [
  { label: "Plan next semester", target: "/next" },
  { label: "Rate your courses", target: "/rate" },
  { label: "Open timetable", target: "/timetable" },
  { label: "See what's new", target: "/notifications" },
];

const pad = (v: number) => String(v).padStart(2, "0");
/** datetime-local value in Tashkent time (UTC+5) for a Date. */
const toLocalInput = (d: Date) => {
  const t = new Date(d.getTime() + 5 * 3600_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
};
const fromLocalInput = (v: string) => new Date(Date.parse(`${v}:00Z`) - 5 * 3600_000);
const human = (d: Date, now: Date) => {
  const day = toLocalInput(d).slice(0, 10);
  const today = toLocalInput(now).slice(0, 10);
  const tomorrow = toLocalInput(new Date(now.getTime() + 86_400_000)).slice(0, 10);
  const label = day === today ? "Today" : day === tomorrow ? "Tomorrow" : day;
  return `${label} ${toLocalInput(d).slice(11)}`;
};

/** A8 Broadcasts · compose: bot message + in-app banner from one composer. */
export function Broadcasts({ data }: { data: BroadcastsData }) {
  const now = new Date();
  const [audience, setAudience] = useState<Audience>({});
  const [course, setCourse] = useState("");
  const [text, setText] = useState("");
  const [button, setButton] = useState<number>(0);
  const [banner, setBanner] = useState(false);
  const [bannerUntil, setBannerUntil] = useState(toLocalInput(new Date(now.getTime() + 7 * 86_400_000)).slice(0, 10));
  const [sendAt, setSendAt] = useState(() => {
    const d = toLocalInput(now).slice(0, 10);
    const at = fromLocalInput(`${d}T19:00`);
    return toLocalInput(at < now ? new Date(now.getTime() + 10 * 60_000) : at);
  });
  const [size, setSize] = useState(data.everyone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [, startCount] = useTransition();

  useEffect(() => {
    startCount(async () => setSize(await countAudience(audience)));
  }, [audience]);

  const everyone = !audience.years?.length && !audience.courseIds?.length && !audience.unrated;
  const toggleYear = (y: number) => setAudience((a) => ({ ...a, years: a.years?.includes(y) ? a.years.filter((x) => x !== y) : [...(a.years ?? []), y].sort() }));
  const when = fromLocalInput(sendAt);
  const actual = nextSendable(when);
  const btn = button > 0 ? BUTTONS[button - 1] : null;
  const input = () => ({ audience, text, button: btn, bannerUntil: banner ? new Date(`${bannerUntil}T23:59:00+05:00`) : null, sendAt: when });

  const schedule = () =>
    text.trim() &&
    !pending &&
    start(async () => {
      const r = await scheduleBroadcast(input());
      setMsg(r.ok ? { ok: true, text: `Scheduled for ${human(actual, new Date())}` } : { ok: false, text: r.error });
      if (r.ok) setText("");
    });
  const test = () =>
    text.trim() &&
    start(async () => {
      const r = await sendTestBroadcast(input());
      setMsg(r.ok ? { ok: true, text: "Sent to your Telegram" } : { ok: false, text: r.error });
    });
  useKeys({ "mod+Enter": schedule });

  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 600 }}>
        <h1 className={s.h1}>New broadcast</h1>
        <Label>WHO</Label>
        <div className={s.wrap}>
          <button type="button" className={cx(s.chip, everyone && s.chipInverse)} onClick={() => (setAudience({}), setCourse(""))}>Everyone</button>
          {[1, 2, 3, 4].map((y) => (
            <button key={y} type="button" className={cx(s.chip, audience.years?.includes(y) && s.chipInverse)} onClick={() => toggleYear(y)}>Year {y}</button>
          ))}
          <select
            className={cx(s.chip, !!audience.courseIds?.length && s.chipInverse)}
            value={course}
            aria-label="Taking a course"
            onChange={(e) => (setCourse(e.target.value), setAudience((a) => ({ ...a, courseIds: e.target.value ? [e.target.value] : undefined })))}
          >
            <option value="">Taking a course…</option>
            {data.courses.map((c) => <option key={c.code} value={c.code}>Taking {c.name}</option>)}
          </select>
          <button type="button" className={cx(s.chip, audience.unrated && s.chipInverse)} onClick={() => setAudience((a) => ({ ...a, unrated: a.unrated ? undefined : data.term }))}>
            Haven&apos;t rated {data.term}
          </button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-accent)" }}>
          {size.students.toLocaleString("en-US")} students · {size.reachable.toLocaleString("en-US")} reachable in the bot
        </div>
        <Label>MESSAGE</Label>
        <textarea className={s.message} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should students know?" maxLength={1000} aria-label="Message" />
        <div className={s.kv}>
          <span className={cx(s.kvKey, s.kvKeyWide)}>Button</span>
          <select className={s.select} value={button} onChange={(e) => setButton(Number(e.target.value))}>
            <option value={0}>No button</option>
            {BUTTONS.map((b, i) => <option key={b.target} value={i + 1}>{b.label} → opens {b.target}</option>)}
          </select>
        </div>
        <div className={s.kv}>
          <span className={cx(s.kvKey, s.kvKeyWide)}>Also show</span>
          <label className={s.kvVal} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={banner} onChange={(e) => setBanner(e.target.checked)} />
            Banner in the app until
            <input type="date" className={s.inputInline} value={bannerUntil} onChange={(e) => setBannerUntil(e.target.value)} disabled={!banner} />
          </label>
        </div>
        <div className={s.kv}>
          <span className={cx(s.kvKey, s.kvKeyWide)}>Send</span>
          <span className={s.kvVal} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="datetime-local" className={s.inputInline} value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
            {inQuietHours(when) ? `→ ${human(actual, now)} · quiet hours respected` : "· quiet hours respected"}
          </span>
        </div>
        <p className={s.note} style={{ margin: 0 }}>Quiet hours 23:00–07:00. One broadcast per student per day.</p>
        {msg && <div className={msg.ok ? s.small : s.error}>{msg.text}</div>}
        <div className={s.spacer} />
        <div className={s.actions}>
          <Btn tone="accent" hint="⌘↵" onClick={schedule} disabled={!text.trim() || pending}>Schedule</Btn>
          <Btn onClick={test} disabled={!text.trim() || pending}>Send test to me</Btn>
        </div>
      </section>
      <aside className={cx(s.detail, s.sunkenPanel)} style={{ padding: "28px 25.5px" }} aria-label="Preview">
        <Label>PREVIEW · TELEGRAM</Label>
        <div className={s.tgBubble}>{text.trim() || "Your message shows here."}</div>
        {btn && <div className={s.tgButton}>{btn.label}</div>}
        <Label>RECENT</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.recent.length === 0 && <p className={s.small}>No broadcasts yet.</p>}
          {data.recent.map((b) => (
            <div key={b.id} className={s.tr} title={b.audience}>
              <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{b.text.split("\n")[0]} — {b.when}</span>
              <span className={s.td} style={{ width: 80 }}>{b.delivered == null ? "—" : b.delivered.toLocaleString("en-US")}</span>
              <span className={s.td} style={{ width: 70 }}>{b.opened}</span>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
