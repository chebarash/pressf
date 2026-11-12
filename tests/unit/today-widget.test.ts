import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { WIDGET_HTML, widgetData } from "@/lib/telegram/widget";
import { widgetDay } from "@/server/sync/widget";
import type { ClassView } from "@/server/views/classes";

const cls = (start: string, end: string, name = "Calculus 1"): ClassView =>
  ({ key: `101@${start}`, courseId: "101", code: "MATH111", name, kind: "lecture", start, end, time: "", endTime: "", room: "B-204", teacher: null, changedFrom: null, lessonIds: [], status: "later" }) as ClassView;

describe("the Today widget", () => {
  it("fits Telegram's limits: 32 KB of HTML, 4 KB compressed", () => {
    expect(Buffer.byteLength(WIDGET_HTML)).toBeLessThan(32_768);
    expect(deflateSync(WIDGET_HTML, { level: 9 }).length).toBeLessThan(4096);
  });

  it("keeps its data under 1024 bytes, dropping topics and then classes", () => {
    const classes = Array.from({ length: 6 }, (_, i) => ({ start: `2026-11-02T0${i}:00:00Z`, end: `2026-11-02T0${i}:50:00Z`, name: "A very long course name that goes on and on and on", room: "B-204", topic: "x".repeat(200) }));
    const out = widgetData({ label: "Today", classes, due: [{ at: new Date("2026-11-02T18:59:00Z"), title: "Lab 6", course: "Databases" }] });
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(1024);
    expect(JSON.parse(out).d[0]).toEqual([1793645940, "Lab 6 · Databases"]);
  });

  it("shows today while a class is left, then the next day with classes", () => {
    const list = [cls("2026-11-02T05:00:00Z", "2026-11-02T06:20:00Z"), cls("2026-11-04T04:00:00Z", "2026-11-04T05:20:00Z", "Physics 1")];
    expect(widgetDay(list, new Date("2026-11-02T04:00:00Z"))?.label).toBe("Today");
    const later = widgetDay(list, new Date("2026-11-02T07:00:00Z"));
    expect([later?.day, later?.classes.map((c) => c.name)]).toEqual(["2026-11-04", ["Physics 1"]]);
    expect(widgetDay([], new Date("2026-11-02T07:00:00Z"))).toBeNull();
  });
});
