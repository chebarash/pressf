import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLog, facultyPeople, lmsTeachers, teacherOverrides, users } from "@/lib/db/schema";
import { importFaculty, lastImport } from "@/server/faculty";
import * as profiles from "@/server/admin/profiles";
import { Forbidden } from "@/server/admin/access";
import { AdminError } from "@/server/admin/ops";
import { setRole } from "@/server/identity";
import { teachersByIds } from "@/server/views/shared";
import { resetDb } from "../fixtures/db";

const PAGE = `<select id="department"><option value="0" selected>Choose the department</option>
<option value="77">Deans of Specialized Schools</option>
<option value="26">School of Computing</option>
<option value="28">Department of AI</option></select>`;

type Site = { page?: string; lists: Record<string, Array<{ id: number; name: string }>>; details: Record<string, Record<string, unknown>>; fail?: RegExp };

/** A fake interactive.newuu.uz; records every URL asked for. */
function site(s: Site) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(new Headers(init?.headers).get("user-agent")).toMatch(/PressF/);
    if (s.fail?.test(url)) return new Response("down", { status: 503 });
    const path = new URL(url).pathname;
    if (path === "/faculty") return new Response(s.page ?? PAGE);
    const list = path.match(/^\/get-professors\/(\d+)$/);
    if (list) return Response.json(s.lists[list[1]] ?? []);
    const detail = path.match(/^\/get-professor-details\/(\d+)\/(\d+)$/);
    if (detail) return Response.json(s.details[detail[2]] ?? {});
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

const SITE: Site = {
  lists: {
    "77": [{ id: 282, name: "Aleksandr Kapitonov Aleksandrovich" }],
    "26": [{ id: 641, name: "ARUNAVA ROY " }],
    "28": [
      { id: 641, name: "ARUNAVA ROY " },
      { id: 597, name: "SIYAVUSHXON XOLMATOV FARRUXOVICH" },
      { id: 700, name: "KARIMOV DILSHOD" },
      { id: 701, name: "JOHN NOBODY" },
    ],
  },
  details: {
    "641": { fullName: "ARUNAVA ROY ", department: "Department of AI", position: "Associate Professor", email: "a.roy@newuu.uz", office: "115", photo: "http://api.newuu.uz/employee/image/x" },
    "597": { fullName: "SIYAVUSHXON XOLMATOV FARRUXOVICH", department: "Department of AI", position: "Assistant Professor", email: "s.kholmatov@newuu.uz", office: "x", photo: "http://api.newuu.uz/employee/image/y" },
    "282": { fullName: "Aleksandr Kapitonov Aleksandrovich", department: "Deans of Specialized Schools", position: "Dean", email: "a.kapitonov@newuu.uz", office: "201" },
    "700": { fullName: "KARIMOV DILSHOD", department: "Department of AI", position: "Lecturer", email: "d.karimov@newuu.uz", office: "300" },
    "701": { fullName: "JOHN NOBODY", department: "Department of AI", position: "Lecturer", email: "j.nobody@newuu.uz", office: "301" },
  },
};

let admin: string;
let mod: string;

beforeEach(async () => {
  await resetDb();
  [admin, mod] = (await db().insert(users).values([{ email: "boss@newuu.uz" }, { email: "mod@newuu.uz" }]).returning()).map((u) => u.id);
  await setRole(mod, "moderator");
  await db().insert(lmsTeachers).values([
    { id: "t-roy", firstName: "Arunava", surName: "Roy", position: "Lecturer", department: "Computer Science" },
    { id: "t-xol", firstName: "Siyavush", surName: "Kholmatov" },
    { id: "t-kap", firstName: "Aleksandr", surName: "Kapitonov" },
    { id: "t-kar1", firstName: "Dilshod", surName: "Karimov" },
    { id: "t-kar2", firstName: "Dilshod", surName: "Karimov" },
  ]);
});

const run = (s: Site = SITE) => {
  const fake = site(s);
  return importFaculty({ fetch: fake.f, pauseMs: 0, base: "https://site.test" }).then((summary) => ({ summary, calls: fake.calls }));
};
const person = async (siteId: number) => (await db().select().from(facultyPeople).where(eq(facultyPeople.siteId, siteId)))[0];

describe("import from newuu.uz", () => {
  it("imports, groups by school, links confident matches and lists the rest", async () => {
    const { summary, calls } = await run();
    expect(summary).toMatchObject({ ok: true, matched: 3, unmatched: 2, people: 5, departments: 3, failed: 0 });
    // Roy is listed under the school and the department: details fetched once, from the department.
    expect(calls.filter((u) => u.includes("/get-professor-details/") && u.endsWith("/641"))).toEqual(["https://site.test/get-professor-details/28/641"]);
    expect(await person(641)).toMatchObject({ teacherId: "t-roy", match: "auto", name: "Arunava Roy", office: "115", email: "a.roy@newuu.uz", department: "Department of AI", school: "School of Computing", position: "Associate Professor" });
    // Close spelling confirmed by the email; "x" office dropped.
    expect(await person(597)).toMatchObject({ teacherId: "t-xol", office: null });
    expect(await person(282)).toMatchObject({ teacherId: "t-kap", school: null, department: "Deans of Specialized Schools" });
    expect(await person(700)).toMatchObject({ teacherId: null, match: "none", candidates: ["t-kar1", "t-kar2"] });
    // The photo is never stored.
    expect(JSON.stringify(await db().select().from(facultyPeople))).not.toContain("api.newuu.uz");
    expect(await lastImport()).toMatchObject({ matched: 3, unmatched: 2 });
  });

  it("is idempotent: a second run changes nothing", async () => {
    await run();
    const before = await db().select().from(facultyPeople).orderBy(facultyPeople.siteId);
    const { summary } = await run();
    expect(summary).toMatchObject({ matched: 3, updated: 0, unmatched: 2 });
    const after = await db().select().from(facultyPeople).orderBy(facultyPeople.siteId);
    expect(after.map(({ fetchedAt: _f, ...r }) => r)).toEqual(before.map(({ fetchedAt: _f, ...r }) => r));
  });

  it("counts changed profiles as updated", async () => {
    await run();
    const moved = { ...SITE, details: { ...SITE.details, "641": { ...SITE.details["641"], office: "220" } } };
    const { summary } = await run(moved);
    expect(summary.updated).toBe(1);
    expect((await person(641)).office).toBe("220");
  });

  it("keeps the previous data when the site or a request fails", async () => {
    await run();
    const down = await run({ ...SITE, fail: /\/faculty$/ });
    expect(down.summary).toMatchObject({ ok: false, matched: 3, failed: 1 });
    expect((await person(641)).office).toBe("115");

    const flaky = await run({ ...SITE, details: { ...SITE.details, "641": { ...SITE.details["641"], office: "999" } }, fail: /details\/28\/641|get-professors\/77/ });
    expect(flaky.summary.ok).toBe(false);
    expect(flaky.summary.failed).toBe(2);
    expect(await person(641)).toMatchObject({ office: "115", teacherId: "t-roy" });
    // Kapitonov's listing failed this time: his row and link stay.
    expect(await person(282)).toMatchObject({ teacherId: "t-kap", office: "201" });
  });

  it("keeps manual links and dismissals across imports", async () => {
    await run();
    await profiles.assignPerson(admin, 700, "t-kar2");
    await profiles.dismissPerson(admin, 701);
    const { summary } = await run();
    expect(summary).toMatchObject({ matched: 4, unmatched: 0 });
    expect(await person(700)).toMatchObject({ teacherId: "t-kar2", match: "manual" });
    expect(await person(701)).toMatchObject({ teacherId: null, match: "dismissed" });
    const actions = (await db().select().from(auditLog)).map((a) => a.action).sort();
    expect(actions).toEqual(["teacher.newuu.assign", "teacher.newuu.dismiss"]);
  });

  it("a manual link takes the professor from an automatic one", async () => {
    await run();
    await profiles.assignPerson(admin, 701, "t-roy");
    expect(await person(641)).toMatchObject({ teacherId: null, match: "none" });
    expect(await person(701)).toMatchObject({ teacherId: "t-roy", match: "manual" });
    await run();
    // Roy stays with the manual link; the matcher does not take him back.
    expect((await person(641)).teacherId).toBeNull();
  });
});

describe("profile overrides", () => {
  it("override > newuu.uz > LMS, and survives every import", async () => {
    await run();
    expect((await teachersByIds(["t-roy"])).get("t-roy")).toMatchObject({ name: "Arunava Roy", position: "Associate Professor", department: "Department of AI", school: "School of Computing" });
    await profiles.saveProfile(admin, "t-roy", { position: "Professor", hours: "Tue 14:00–15:30", email: "" });
    await run();
    expect((await teachersByIds(["t-roy"])).get("t-roy")).toMatchObject({ position: "Professor", department: "Department of AI" });
    const detail = await profiles.profileDetail("t-roy");
    expect(detail?.shown).toMatchObject({ position: "Professor", office: "115", email: "a.roy@newuu.uz", hours: "Tue 14:00–15:30" });
    expect(detail?.lms).toMatchObject({ position: "Lecturer" });

    // Reset to imported.
    await profiles.resetProfile(admin, "t-roy");
    expect(await db().select().from(teacherOverrides)).toEqual([]);
    expect((await teachersByIds(["t-roy"])).get("t-roy")?.position).toBe("Associate Professor");
    const audit = await db().select().from(auditLog).where(eq(auditLog.target, "teacher:t-roy"));
    expect(audit.map((a) => a.action).sort()).toEqual(["teacher.profile", "teacher.profile.reset"]);
    expect(audit.find((a) => a.action === "teacher.profile")?.detail).toMatchObject({ position: { from: null, to: "Professor" } });
  });

  it("the LMS stays the fallback without an import", async () => {
    expect((await teachersByIds(["t-roy"])).get("t-roy")).toMatchObject({ position: "Lecturer", department: "Computer Science", school: null });
    await profiles.saveProfile(admin, "t-roy", { name: "Arunava K. Roy" });
    expect((await teachersByIds(["t-roy"])).get("t-roy")?.name).toBe("Arunava K. Roy");
  });

  it("validates and refuses non-admins", async () => {
    await expect(profiles.saveProfile(admin, "t-roy", { email: "roy@gmail.com" })).rejects.toBeInstanceOf(AdminError);
    await expect(profiles.saveProfile(admin, "nobody", { office: "1" })).rejects.toBeInstanceOf(AdminError);
    await expect(profiles.saveProfile(mod, "t-roy", { office: "1" })).rejects.toBeInstanceOf(Forbidden);
    await expect(profiles.resetProfile(mod, "t-roy")).rejects.toBeInstanceOf(Forbidden);
    await run();
    await expect(profiles.assignPerson(mod, 700, "t-kar1")).rejects.toBeInstanceOf(Forbidden);
    await expect(profiles.dismissPerson(mod, 701)).rejects.toBeInstanceOf(Forbidden);
    await expect(profiles.startImport(mod, () => {})).rejects.toBeInstanceOf(Forbidden);
    expect(await db().select().from(teacherOverrides)).toEqual([]);
  });

  it("admin pages list unmatched people with candidates", async () => {
    await run();
    const page = await profiles.unmatchedPage("", 700);
    expect(page.people.map((p) => p.siteId)).toEqual([700, 701]);
    expect(page.selected?.candidates.map((c) => c.id)).toEqual(["t-kar1", "t-kar2"]);
    expect(page.last).toMatchObject({ matched: 3 });
    const prof = await profiles.profilesPage("roy", undefined);
    expect(prof.list[0]).toMatchObject({ id: "t-roy", imported: true });
    expect(prof.selected?.imported).toMatchObject({ office: "115" });
  });
});
