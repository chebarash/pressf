import { describe, expect, it } from "vitest";
import { canSubmit, HOURS, MAX_TAGS } from "@/core/ratings";
import { rateScreen } from "@/screens/mobile/load";
import { initialForm, toggle, toInput } from "@/screens/mobile/rate-form";
import type { RateQueueView } from "@/screens/mobile/views";

const item = {
  courseId: "c1",
  code: "MATH111",
  name: "Calculus 1",
  term: "Spring 2026",
  href: "/rate/c1",
  teachers: [
    { id: "t1", name: "Gonçalo Pinto", role: "lecture" as const, roleLabel: "Lectures" },
    { id: "t2", name: "Emily Carter", role: "tutorial" as const, roleLabel: "Tutorials" },
  ],
};

describe("rate form", () => {
  it("offers the four D5 hour buckets and sends the one picked", () => {
    expect(HOURS).toEqual(["0-2", "2-5", "5-10", "10+"]);
    const form = initialForm(item, null);
    expect(form.hours).toBeNull();
    for (const h of HOURS) expect(toInput(item, { ...form, recommend: "yes", hours: h }).hours).toBe(h);
  });

  it("reads an older five-bucket draft as today's bucket", () => {
    const draft = { recommend: "yes" as const, hours: "6-10" as never, difficulty: null, tags: [], teachers: [] };
    expect(initialForm(item, draft).hours).toBe("5-10");
  });

  it("keeps at most three stickers", () => {
    let tags: string[] = [];
    for (const t of ["a", "b", "c", "d"]) tags = toggle(tags, t);
    expect(tags).toEqual(["a", "b", "c"]);
    expect(tags.length).toBe(MAX_TAGS);
    expect(toggle(tags, "b")).toEqual(["a", "c"]);
  });

  it("can be sent once 'Would you recommend it?' is answered, and only then", () => {
    const form = initialForm(item, null);
    expect(canSubmit(toInput(item, form))).toBe(false);
    expect(canSubmit(toInput(item, { ...form, recommend: "unsure" }))).toBe(true);
  });

  it("sends only the teachers the student touched", () => {
    const form = initialForm(item, null);
    const input = toInput(item, { ...form, recommend: "yes", hours: "5-10", difficulty: 4, teachers: { ...form.teachers, "t1|lecture": { pressF: true, tags: ["Explains clearly"] } } });
    expect(input).toEqual({ recommend: "yes", hours: "5-10", difficulty: 4, tags: [], teachers: [{ teacherId: "t1", role: "lecture", pressF: true, tags: ["Explains clearly"] }] });
  });

  it("starts from an earlier rating when editing", () => {
    const form = initialForm(item, { recommend: "no", hours: "10+", difficulty: 5, tags: ["Heavy reading"], teachers: [{ teacherId: "t2", role: "tutorial", pressF: true, tags: [] }] });
    expect(form.hours).toBe("10+");
    expect(form.teachers["t2|tutorial"].pressF).toBe(true);
    expect(form.teachers["t1|lecture"].pressF).toBeNull();
  });
});

describe("rate screen", () => {
  const queue: RateQueueView = {
    currentTerm: "Fall 2026",
    waiting: [item, { ...item, courseId: "c2", href: "/rate/c2" }],
    rated: [
      { ...item, courseId: "old", term: "Fall 2024", recommend: "yes", pressedF: [], updatedAt: "", updatedLabel: "", canEdit: false },
      { ...item, courseId: "c3", term: "Fall 2025", recommend: "yes", pressedF: [], updatedAt: "", updatedLabel: "", canEdit: true },
    ],
    total: 4,
    ask: { level: "card", term: "Spring 2026", waiting: [] },
  };

  it("opens only courses from the student's own queue", () => {
    expect(rateScreen(queue, "someone-elses").open).toBeNull();
    expect(rateScreen(queue, "old").open).toBeNull(); // rated and no longer editable
    expect(rateScreen(queue, "c3").open?.mode).toBe("single");
    expect(rateScreen(queue, "c1").open).toMatchObject({ mode: "queue", returnHref: "/rate" });
  });

  it("returns to the course page only for a course path", () => {
    expect(rateScreen(queue, "c1", "/c/MATH111").open).toMatchObject({ mode: "single", returnHref: "/c/MATH111" });
    expect(rateScreen(queue, "c1", "https://evil.example").open?.returnHref).toBe("/rate");
    expect(rateScreen(queue, "c1", "/c/../admin").open?.returnHref).toBe("/rate");
  });
});
