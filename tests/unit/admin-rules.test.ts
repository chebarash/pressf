import { describe, expect, it } from "vitest";
import { adminSections } from "@/core/roles";
import { canOpen } from "@/server/admin/access";
import { audienceLabel, checkFlag, checkLines, dayClash, inQuietHours, nextSendable, ruleFor, twins, yearOf } from "@/server/admin/rules";

// 2026-11-03 is a Tuesday; Tashkent is UTC+5.
const tashkent = (iso: string) => new Date(`${iso}+05:00`);

describe("admin access", () => {
  it("gives moderators overview, uploads, reports and audit only", () => {
    expect(adminSections("moderator").map((s) => s.id)).toEqual(["overview", "uploads", "reports", "audit"]);
    expect(canOpen("moderator", "people")).toBe(false);
    expect(canOpen("moderator", "uploads")).toBe(true);
    expect(canOpen("admin", "system")).toBe(true);
    expect(canOpen("student", "overview")).toBe(false);
    expect(canOpen("guest", "overview")).toBe(false);
  });
});

describe("upload checks", () => {
  it("turns intake checks into lines and a queue flag", () => {
    const ok = { lms: { match: null }, duplicate: false, exam: { date: "14 Oct 2025", running: false }, personal: [] };
    expect(checkLines(ok, "Calculus 1")).toEqual([
      { ok: true, text: "Not in LMS files for Calculus 1" },
      { ok: true, text: "Not a copy of another student upload" },
      { ok: true, text: "Exam was 14 Oct 2025 — not running now" },
      { ok: true, text: "No phone numbers or student IDs found" },
    ]);
    expect(checkFlag(ok)).toBeNull();
    expect(checkFlag({ lms: { match: "Week 1 slides.pdf", score: 0.92 } })).toBe("lms");
    expect(checkLines({ lms: { match: "Week 1 slides.pdf", score: 0.92 } }, "Physics 1")[0]).toEqual({ ok: false, text: "Maybe in LMS: Week 1 slides.pdf (92%)" });
    expect(checkFlag({ exam: { running: true } })).toBe("check");
    expect(checkFlag({ personal: ["phone numbers"] })).toBe("check");
    expect(checkLines({}, "x")).toEqual([]);
  });
});

describe("reports", () => {
  it("picks the rule for the most-reported reason", () => {
    expect(ruleFor({ insult: 3, untrue: 1 })).toMatch(/critique the course, not the person/);
    expect(ruleFor({ weird: 2 })).toMatch(/Rule:/);
  });
});

describe("broadcast timing", () => {
  it("respects quiet hours 22:00–08:00", () => {
    expect(inQuietHours(tashkent("2026-11-03T19:00:00"))).toBe(false);
    expect(inQuietHours(tashkent("2026-11-03T22:30:00"))).toBe(true);
    expect(inQuietHours(tashkent("2026-11-03T07:59:00"))).toBe(true);
    expect(nextSendable(tashkent("2026-11-03T23:10:00"))).toEqual(tashkent("2026-11-04T08:00:00"));
    expect(nextSendable(tashkent("2026-11-03T03:00:00"))).toEqual(tashkent("2026-11-03T08:00:00"));
    const fine = tashkent("2026-11-03T19:00:00");
    expect(nextSendable(fine)).toBe(fine);
  });
  it("allows one broadcast per student per day", () => {
    const existing = [{ sendAt: tashkent("2026-11-03T10:00:00"), audience: { years: [1] } }];
    expect(dayClash(existing, { sendAt: tashkent("2026-11-03T19:00:00"), audience: {} })).toBe(existing[0]);
    expect(dayClash(existing, { sendAt: tashkent("2026-11-03T19:00:00"), audience: { years: [2] } })).toBeNull();
    expect(dayClash(existing, { sendAt: tashkent("2026-11-04T19:00:00"), audience: { years: [1] } })).toBeNull();
  });
  it("labels audiences", () => {
    expect(audienceLabel({})).toBe("Everyone");
    expect(audienceLabel({ years: [1, 2], unrated: "Fall 2026" })).toBe("Year 1 · Year 2 · Haven't rated Fall 2026");
  });
});

describe("professor twins", () => {
  it("pairs spellings with and without accents, and initials, unless marked distinct", () => {
    const t = [
      { id: "1", firstName: "Gonçalo", lastName: "Pinto" },
      { id: "2", firstName: "Goncalo", lastName: "Pinto" },
      { id: "3", firstName: "Emily", lastName: "Carter" },
      { id: "4", firstName: "E.", lastName: "Carter" },
      { id: "5", firstName: "Aziz", lastName: "Karimov" },
    ];
    expect(twins(t).map(([a, b]) => [a.id, b.id])).toEqual([["1", "2"], ["3", "4"]]);
    expect(twins(t, new Set(["3|4"])).map(([a, b]) => [a.id, b.id])).toEqual([["1", "2"]]);
  });
  it("reads the year of study from semesters", () => {
    expect(yearOf(3)).toBe(2);
    expect(yearOf(1)).toBe(1);
    expect(yearOf(null)).toBeNull();
  });
});
