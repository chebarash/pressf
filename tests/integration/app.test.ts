import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as null | { id: string; email: string; isAdmin: boolean } }));
const lmsLogin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/lms/client", async (original) => ({
  ...(await original<typeof import("@/lib/lms/client")>()),
  login: lmsLogin,
}));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getUser: async () => user.current,
}));

import { eq } from "drizzle-orm";
import { POST as cron } from "@/app/api/cron/sync/route";
import { GET as health } from "@/app/api/health/route";
import { GET as rawFile } from "@/app/(app)/f/[id]/raw/route";
import { authOptions } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { courseDetails, resolveRequirement, unlocks } from "@/lib/content";
import { db } from "@/lib/db";
import { courseOverrides, lmsAccounts, syllabi, users } from "@/lib/db/schema";
import { LmsError } from "@/lib/lms/client";
import { open as openSealed } from "@/lib/lms/crypto";
import { syllabus } from "../fixtures/catalog";
import { resetDb, seedCatalog } from "../fixtures/db";

beforeEach(async () => {
  await resetDb();
  await seedCatalog();
  const [row] = await db().insert(users).values({ email: "s@newuu.uz" }).returning();
  user.current = { id: row.id, email: row.email, isAdmin: false };
});
afterEach(() => vi.restoreAllMocks());

describe("lms sign-in", () => {
  // next-auth keeps the provider's authorize at the top level of the config object.
  const provider = authOptions.providers.find((p) => (p as { options?: { id?: string } }).options?.id === "lms") as unknown as {
    options: { authorize: (c: Record<string, string>) => Promise<{ id: string; email: string } | null> };
  };
  const authorize = (email: string, password: string) => provider.options.authorize({ email, password });

  beforeEach(() => lmsLogin.mockReset());

  it("signs in a valid LMS login and seals the password", async () => {
    lmsLogin.mockResolvedValue({ token: "e30.e30.sig" });
    const result = await authorize("A@newuu.uz", "pw-9");
    expect(result?.email).toBe("a@newuu.uz");
    expect(lmsLogin).toHaveBeenCalledWith("a@newuu.uz", "pw-9");
    const [row] = await db().select().from(lmsAccounts).where(eq(lmsAccounts.userId, result!.id));
    expect(row.sealedPassword).not.toContain("pw-9");
    expect(openSealed(row.sealedPassword)).toBe("pw-9");
  });

  it("rejects a wrong password without saving anything", async () => {
    lmsLogin.mockRejectedValueOnce(new LmsError("no token", 401));
    await expect(authorize("a@newuu.uz", "wrong")).rejects.toThrow("wrong-password");
    expect(await db().select().from(lmsAccounts)).toHaveLength(0);
  });

  it("tells a down LMS apart from a wrong password", async () => {
    lmsLogin.mockRejectedValueOnce(new LmsError("LMS request failed", 0));
    await expect(authorize("a@newuu.uz", "pw")).rejects.toThrow("lms-down");
    lmsLogin.mockRejectedValueOnce(new LmsError("LMS 502", 502));
    await expect(authorize("a@newuu.uz", "pw")).rejects.toThrow("lms-down");
    expect(await db().select().from(lmsAccounts)).toHaveLength(0);
  });

  it("never puts the password in an error", async () => {
    lmsLogin.mockRejectedValueOnce(new LmsError("no token", 401, { echo: "secret-pw" }));
    const error = await authorize("a@newuu.uz", "secret-pw").catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain("secret-pw");
  });

  it("rejects non-student emails before hitting the LMS", async () => {
    await expect(authorize("a@gmail.com", "pw")).rejects.toThrow("not-student");
    expect(lmsLogin).not.toHaveBeenCalled();
  });

  it("rejects empty credentials", async () => {
    expect(await authorize("", "")).toBeNull();
  });
});

describe("course content", () => {
  const add = (name: string, term: string, matched = true, extra = {}) => db().insert(syllabi).values({ courseCode: "MATH111", sourceName: name, matched, data: syllabus({ term, ...extra }) });
  it("shows the newest matched syllabus and hides unmatched ones", async () => {
    await add("old", "Fall 2023", true, { description: "old" });
    await add("new", "Fall 2024", true, { description: "new" });
    await add("hidden", "Fall 2026", false, { description: "hidden" });
    expect((await courseDetails("MATH111"))?.data.description).toBe("new");
  });
  it("has nothing without a syllabus", async () => expect(await courseDetails("MATH111")).toBeNull());
  it("keeps admin edits when a newer syllabus arrives", async () => {
    await add("a", "Fall 2023");
    await db().insert(courseOverrides).values({ code: "MATH111", data: { description: "edited" } });
    await add("b", "Fall 2025", true, { description: "newer" });
    expect((await courseDetails("MATH111"))?.data.description).toBe("edited");
  });
  it("links requirements only when one course fits", async () => {
    const { courses } = await getCatalog();
    expect(resolveRequirement({ text: "Precalculus", code: "" }, courses).code).toBe("MATH101");
    expect(resolveRequirement({ text: "PHYS 101", code: "" }, courses).code).toBe("PHYS101");
    expect(resolveRequirement({ text: "High School Algebra", code: "" }, courses).code).toBeNull();
  });
  it("works out what a course unlocks", async () => {
    await add("a", "Fall 2024");
    const catalog = await getCatalog();
    expect((await unlocks("MATH101", catalog)).map((c) => c.code)).toEqual(["MATH111"]);
  });
});

describe("routes", () => {
  it("answers health checks", async () => expect((await health()).status).toBe(200));
  it("protects the sync job", async () => {
    expect((await cron(new Request("https://x", { method: "POST" }))).status).toBe(401);
    expect((await cron(new Request("https://x", { method: "POST", headers: { authorization: "Bearer wrong-secret" } }))).status).toBe(401);
  });
});

describe("in-page file preview bytes (/f/<id>/raw)", () => {
  const get = (id: string, q = "") => rawFile(new Request(`https://x/f/${id}/raw${q}`), { params: Promise.resolve({ id }) });

  it("is for signed-in students or a valid signed link only", async () => {
    user.current = null;
    expect((await get("F1")).status).toBe(401);
    expect((await get("F1", `?exp=${Math.floor(Date.now() / 1000) + 600}&sig=forged`)).status).toBe(401);
  });

  it("answers 404 for a file that does not exist", async () => {
    expect((await get("nope")).status).toBe(404);
  });
});
