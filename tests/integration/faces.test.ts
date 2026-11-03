import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bucket = vi.hoisted(() => ({ objects: new Map<string, { body: Uint8Array; type: string }>() }));
vi.mock("@/lib/storage", async (orig) => ({
  ...(await orig<object>()),
  putObject: async (key: string, body: Buffer, type: string) => (bucket.objects.set(key, { body: new Uint8Array(body), type }), key),
  getObject: async (key: string) => {
    const o = bucket.objects.get(key);
    return o ? { body: o.body, contentType: o.type } : null;
  },
}));

import { checkFace } from "@/core/faces";
import { db } from "@/lib/db";
import { auditLog, catalogCache, faces, lmsCurricula, lmsPrograms, lmsTeachers, teacherAliases, users } from "@/lib/db/schema";
import { GET as faceRoute } from "@/app/faces/[id]/route";
import { setRole } from "@/server/identity";
import { assignOldFace, discardOldFace, facesPage, removeFace, runFaceTransfer, setFace } from "@/server/admin/faces";
import { Forbidden } from "@/server/admin/ops";
import { matchScore, rankCandidates, sureMatch, transferOldFaces } from "@/server/faces-transfer";
import * as views from "@/server/views";
import { resetDb } from "../fixtures/db";
import { seedStudent } from "../fixtures/student";

/** A tiny valid PNG header: size and colour type are all the checks read. */
function png(width: number, height: number, colorType = 6): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([...("IHDR" as string)].map((c) => c.charCodeAt(0)), 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b[24] = 8;
  b[25] = colorType;
  b.set([0, 0, 0, 0], 33);
  b.set([..."IEND"].map((c) => c.charCodeAt(0)), 37);
  return b;
}
const svg = (inner = '<path d="M0 0h10v10z"/>') => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`);

let admin: string;
let mod: string;

beforeEach(async () => {
  await resetDb();
  bucket.objects.clear();
  await seedStudent();
  admin = (await db().insert(users).values({ email: "boss@newuu.uz" }).returning())[0].id;
  mod = (await db().insert(users).values({ email: "mod@newuu.uz" }).returning())[0].id;
  await setRole(mod, "moderator");
});

describe("face checks", () => {
  it("takes transparent square PNGs and plain SVGs", () => {
    expect(checkFace(png(512, 512))).toMatchObject({ ok: true, format: { type: "png" } });
    expect(checkFace(png(256, 256, 4))).toMatchObject({ ok: true });
    expect(checkFace(svg())).toMatchObject({ ok: true, format: { type: "svg", contentType: "image/svg+xml" } });
    expect(checkFace(new TextEncoder().encode(`<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"><g fill="#000"><path d="M0 0"/></g></svg>`))).toMatchObject({ ok: true });
  });

  it("refuses photos' telltales, scripts and other files", () => {
    expect(checkFace(png(512, 512, 2))).toMatchObject({ ok: false, error: expect.stringMatching(/transparent/) });
    expect(checkFace(png(40, 40))).toMatchObject({ ok: false, error: expect.stringMatching(/small/) });
    expect(checkFace(png(1000, 400))).toMatchObject({ ok: false, error: expect.stringMatching(/square/) });
    expect(checkFace(svg("<script>alert(1)</script>"))).toMatchObject({ ok: false });
    expect(checkFace(svg('<image href="https://x.test/photo.jpg"/>'))).toMatchObject({ ok: false });
    expect(checkFace(svg('<path onload="x()" d="M0 0"/>'))).toMatchObject({ ok: false });
    expect(checkFace(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ ok: false, error: "Upload a PNG or an SVG drawing" });
    expect(checkFace(new Uint8Array(600 * 1024))).toMatchObject({ ok: false });
  });
});

describe("admin faces", () => {
  it("uploads, serves with a version, replaces and removes, all audited", async () => {
    await expect(setFace(mod, "T1", png(512, 512))).rejects.toBeInstanceOf(Forbidden);
    await expect(setFace(admin, "nobody", png(512, 512))).rejects.toThrow("No such professor");
    await expect(setFace(admin, "T1", png(512, 512, 2))).rejects.toThrow(/transparent/);

    await setFace(admin, "T1", png(512, 512));
    const [row] = await db().select().from(faces).where(eq(faces.teacherId, "T1"));
    expect(row.storageKey).toMatch(/^faces\/T1\/[a-z0-9]+\.png$/);
    const p = (await views.professor("T1", null))!;
    expect(p.face).toMatch(/^\/faces\/T1\?v=[a-z0-9]+$/);

    const res = await faceRoute(new Request(`https://pressf.test${p.face}`), { params: Promise.resolve({ id: "T1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    const loose = await faceRoute(new Request("https://pressf.test/faces/T1"), { params: Promise.resolve({ id: "T1" }) });
    expect(loose.headers.get("cache-control")).toContain("max-age=300");
    expect((await faceRoute(new Request("https://pressf.test/faces/T2"), { params: Promise.resolve({ id: "T2" }) })).status).toBe(404);

    await new Promise((r) => setTimeout(r, 5));
    await setFace(admin, "T1", svg());
    const p2 = (await views.professor("T1", null))!;
    expect(p2.face).not.toBe(p.face);
    const res2 = await faceRoute(new Request(`https://pressf.test${p2.face}`), { params: Promise.resolve({ id: "T1" }) });
    expect(res2.headers.get("content-type")).toBe("image/svg+xml");
    expect(res2.headers.get("content-security-policy")).toContain("sandbox");
    expect(bucket.objects.size).toBe(2);

    await removeFace(admin, "T1");
    expect((await views.professor("T1", null))!.face).toBeNull();
    await expect(removeFace(admin, "T1")).rejects.toThrow("No face to remove");
    expect((await db().select().from(auditLog)).map((a) => a.action)).toEqual(["face.set", "face.replace", "face.remove"]);
  });

  it("lists professors with and without a face", async () => {
    await setFace(admin, "T1", png(256, 256));
    const missing = await facesPage("missing", "", undefined);
    expect(missing.counts).toMatchObject({ with: 1, missing: 1, old: 0 });
    expect(missing.list.map((t) => t.name)).toEqual(["Emily Carter"]);
    const withFace = await facesPage("with", "", "T1");
    expect(withFace.selected).toMatchObject({ id: "T1", name: "Gonçalo Pinto", format: "PNG", face: expect.stringMatching(/^\/faces\/T1\?v=/) });
    expect((await facesPage("with", "пинто", undefined)).list.map((t) => t.id)).toEqual(["T1"]);
  });
});

describe("old faces", () => {
  const oldCatalog = (teachers: unknown[]) => db().insert(catalogCache).values({ key: "teachers", data: teachers });

  it("scores names in any order, spelling and with a patronymic", () => {
    expect(matchScore("Gonçalo Pinto", ["Pinto Goncalo"])).toBe(1);
    expect(matchScore("Dilnoza Xasanova", ["Khasanova Dilnoza Rustamovna"])).toBe(1);
    expect(matchScore("Gonçalo Pinto", ["G. Pinto"])).toBeLessThan(0.9);
    expect(matchScore("Teacher", ["Teacher"])).toBe(0);
    const people = [{ id: "a", name: "Ivan Petrov" }, { id: "b", name: "Ivan Petrova" }, { id: "c", name: "Anna Pinter" }];
    expect(sureMatch(rankCandidates(["Petrov Ivan"], people))).toBeNull();
    expect(sureMatch(rankCandidates(["Anna Pinter"], people))?.id).toBe("c");
  });

  it("moves sure matches on deploy, leaves the rest for one click, and is idempotent", async () => {
    await db().insert(lmsTeachers).values([{ id: "T3", firstName: "Ivan", lastName: "Petrov" }, { id: "T4", firstName: "Ivan", lastName: "Petrova" }]);
    await oldCatalog([
      { id: "g-pinto", name: "Pinto Gonçalo", display_name: "Gonçalo Pinto", previous_ids: ["old-pinto"] },
      { id: "i-petrov", display_name: "Ivan Petrov" },
      { id: "nobody", display_name: "Zarina Usmonova" },
    ]);
    await db().insert(faces).values([
      { teacherId: "old-pinto", storageKey: "faces/old-pinto.png" },
      { teacherId: "i-petrov", storageKey: "faces/i-petrov.png" },
      { teacherId: "nobody", storageKey: "faces/nobody.png" },
    ]);
    const r = await transferOldFaces();
    expect(r).toMatchObject({ old: 3, moved: 1, waiting: 2 });
    expect((await db().select().from(faces).where(eq(faces.teacherId, "T1")))[0].storageKey).toBe("faces/old-pinto.png");
    expect((await db().select().from(auditLog)).map((a) => [a.action, a.target])).toEqual([["face.transfer", "teacher:T1"]]);
    expect(await transferOldFaces()).toMatchObject({ old: 2, moved: 0 });

    const page = await facesPage("old", "", undefined);
    expect(page.counts.old).toBe(2);
    const petrov = page.old.find((o) => o.oldId === "i-petrov")!;
    expect(petrov.oldName).toBe("Ivan Petrov");
    expect(petrov.matches[0]).toMatchObject({ id: "T3", pct: 100 });
    expect(petrov.image).toMatch(/^\/faces\/i-petrov\?v=/);
    expect(page.choices.map((c) => c.id)).toEqual(expect.arrayContaining(["T2", "T3", "T4"]));

    await expect(assignOldFace(mod, "i-petrov", "T3")).rejects.toBeInstanceOf(Forbidden);
    await expect(assignOldFace(admin, "T1", "T3")).rejects.toThrow(/already belongs/);
    await expect(assignOldFace(admin, "missing", "T3")).rejects.toThrow(/gone/);
    await assignOldFace(admin, "i-petrov", "T3");
    await discardOldFace(admin, "nobody");
    expect((await db().select().from(faces)).map((f) => f.teacherId).sort()).toEqual(["T1", "T3"]);
    expect((await facesPage("old", "", undefined)).counts.old).toBe(0);
    await runFaceTransfer(admin);
  });

  it("follows professor merges", async () => {
    await db().insert(teacherAliases).values({ oldId: "T9", teacherId: "T2" });
    await db().insert(faces).values({ teacherId: "T9", storageKey: "faces/t9.png" });
    expect(await transferOldFaces()).toMatchObject({ moved: 1, viaMerge: 1 });
    expect((await db().select().from(faces)).map((f) => f.teacherId)).toEqual(["T2"]);
  });

  it("gives one drawing to the same person kept twice in the LMS", async () => {
    await db().insert(lmsTeachers).values([
      { id: "M1", firstName: "Mubina", surName: "Pirmuxamedova" }, { id: "M2", firstName: "Mubina", surName: "Pirmuxamedova" },
      { id: "F1", firstName: "Fakhriddin", surName: "Tojiboev" }, { id: "F2", firstName: "Faxriddin", surName: "Tojiboev" },
    ]);
    await oldCatalog([{ id: "m-p", display_name: "Pirmuxamedova Mubina Abduvali" }, { id: "f-t", display_name: "Tojiboyev Faxriddin Abduqodir" }]);
    await db().insert(faces).values([{ teacherId: "m-p", storageKey: "faces/m.png" }, { teacherId: "f-t", storageKey: "faces/f.png" }]);
    expect(await transferOldFaces()).toMatchObject({ moved: 2, waiting: 0 });
    expect((await db().select().from(faces)).map((f) => `${f.teacherId}:${f.storageKey}`).sort()).toEqual(["F1:faces/f.png", "F2:faces/f.png", "M1:faces/m.png", "M2:faces/m.png"]);
  });

  it("leaves two old faces wanting one professor for the admin", async () => {
    await oldCatalog([{ id: "a", display_name: "Emily Carter" }, { id: "b", display_name: "Carter Emily" }]);
    await db().insert(faces).values([{ teacherId: "a", storageKey: "faces/a.png" }, { teacherId: "b", storageKey: "faces/b.png" }]);
    expect(await transferOldFaces()).toMatchObject({ moved: 0, conflicts: 2, waiting: 2 });
  });
});

describe("search", () => {
  it("ranks across courses, people, programs and files with one engine", async () => {
    const userId = (await db().select().from(users).where(eq(users.email, "boss@newuu.uz")))[0].id;
    await db().insert(lmsPrograms).values({ id: "P1", name: "Computer Science" });
    await db().insert(lmsCurricula).values({ workEducationPlanId: "W1", programId: "P1", data: { semesters: [] } as never });
    expect((await views.search("math111", null)).courses[0]).toMatchObject({ code: "MATH111", href: "/c/MATH111" });
    expect((await views.search("MATH 111", null)).courses[0].code).toBe("MATH111");
    expect((await views.search("calculas", null)).courses[0].code).toBe("MATH111");
    expect((await views.search("Гонсало", null)).people[0]).toMatchObject({ id: "T1", name: "Gonçalo Pinto", face: null });
    expect((await views.search("pinto goncalo", null)).people[0].id).toBe("T1");
    expect((await views.search("computer sci", null)).programs).toEqual([{ id: "P1", name: "Computer Science", href: "/programs/P1/curriculum" }]);
    expect((await views.search("midtrem", { userId })).files[0]).toMatchObject({ title: "Midterm review slides", course: "Calculus 1" });
    expect((await views.search("midterm", null)).files).toEqual([]);
    expect((await views.search("%%", null)).nothing).toBe(false);
  });
});
