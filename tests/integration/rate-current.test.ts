import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => ({ scheduleRefresh: vi.fn() }));
vi.mock("@/server/sync/refresh", () => refresh);

import * as views from "@/server/views";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent } from "../fixtures/student";

let userId: string;

beforeEach(async () => {
  await resetDb();
  userId = await seedStudent();
});

describe("rating this semester's course (Figma 4.2)", () => {
  it("is disabled with the week it opens in before the last three teaching weeks", async () => {
    const c = (await views.course("MATH111", null, { userId }, NOW))!;
    expect(c.you?.status).toBe("now");
    expect(c.rate).toMatchObject({ canRate: false, rated: false, opensIn: 14, href: "/rate/101" });
    const q = (await views.rateQueue(userId, NOW))!;
    expect(q.current).toEqual([]);
    expect(q.window).toEqual({ open: false, opensIn: 14 });
  });

  it("opens from week 14 without joining the rating ask", async () => {
    const week14 = new Date("2026-12-15T07:00:00Z");
    const q = (await views.rateQueue(userId, week14))!;
    expect((q.current ?? []).map((c) => c.courseId)).toContain("101");
    expect(q.ask.waiting.map((w) => w.courseId)).not.toContain("101");
    const c = (await views.course("MATH111", null, { userId }, week14))!;
    expect(c.rate).toMatchObject({ canRate: true, opensIn: null, href: "/rate/101" });
  });

  it("returns absences left for the course a QR check-in named", async () => {
    const a = await views.courseAttendance(userId, "Physics 1");
    expect(a?.absences?.left).toBe(2);
  });
});
