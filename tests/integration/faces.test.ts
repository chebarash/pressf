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
import { auditLog, faces, lmsCurricula, lmsPrograms, lmsTeachers, teacherAliases, users } from "@/lib/db/schema";
import { GET as faceRoute } from "@/app/faces/[id]/route";
import { setRole } from "@/server/identity";
import { DEFAULT_FACE_SPEC, renderFace } from "@/core/face-parts";
import { PhotoFaceError } from "@/lib/face-photo";
import { buildFace, faceFromPhoto, facesPage, removeFace, setFace } from "@/server/admin/faces";
import { Forbidden } from "@/server/admin/ops";
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

  it("builds a face from parts: the server draws it, stores the parts, audits it", async () => {
    const spec = { ...DEFAULT_FACE_SPEC, hair: "curly", glasses: "round" } as const;
    await expect(buildFace(mod, "T1", spec)).rejects.toBeInstanceOf(Forbidden);
    await expect(buildFace(admin, "T1", { ...spec, hair: "mohawk" })).rejects.toThrow("Pick an option");
    await buildFace(admin, "T1", spec);
    const [row] = await db().select().from(faces).where(eq(faces.teacherId, "T1"));
    expect(row.storageKey).toMatch(/^faces\/T1\/[a-z0-9]+\.svg$/);
    expect(row.spec).toEqual(spec);
    const stored = bucket.objects.get(row.storageKey)!;
    expect(stored.type).toBe("image/svg+xml");
    expect(new TextDecoder().decode(stored.body)).toBe(renderFace(spec));
    expect((await facesPage("with", "", "T1")).selected).toMatchObject({ format: "Built", spec });
    const [entry] = await db().select().from(auditLog);
    expect(entry).toMatchObject({ action: "face.set" });

    // Replacing it with an upload forgets the parts.
    await new Promise((r) => setTimeout(r, 5));
    await setFace(admin, "T1", svg());
    expect((await facesPage("with", "", "T1")).selected).toMatchObject({ format: "SVG", spec: null });
  });

  it("reads parts from a photo in memory only, admins only", async () => {
    const jpeg = new Uint8Array(4096);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    const { tone: _tone, ...parts } = DEFAULT_FACE_SPEC;
    const describe = vi.fn(async () => ({ spec: { ...parts, hair: "hijab" as const }, note: "Clear photo." }));
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info")];

    await expect(faceFromPhoto(mod, jpeg, describe)).rejects.toBeInstanceOf(Forbidden);
    await expect(faceFromPhoto(admin, new TextEncoder().encode("%PDF-1.7 not a photo at all"), describe)).rejects.toThrow(/JPEG, PNG/);
    await expect(faceFromPhoto(admin, svg(), describe)).rejects.toThrow(/JPEG, PNG/);
    await expect(faceFromPhoto(admin, new Uint8Array(9 * 1024 * 1024).fill(0xff), describe)).rejects.toThrow(/8 MB/);
    expect(describe).not.toHaveBeenCalled();

    const out = await faceFromPhoto(admin, jpeg, describe);
    expect(out.spec.hair).toBe("hijab");
    expect(describe).toHaveBeenCalledWith(jpeg, "image/jpeg");

    // Nothing was written: no bucket object, no face row, no audit entry, nothing logged.
    expect(bucket.objects.size).toBe(0);
    expect(await db().select().from(faces)).toEqual([]);
    expect(await db().select().from(auditLog)).toEqual([]);
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();

    // A failing reader comes back as a message; the photo still goes nowhere.
    const broke = vi.fn(async () => {
      throw new PhotoFaceError("The Anthropic account is out of credit, so photos can't be read right now. Top up the balance, or build the face by hand.");
    });
    await expect(faceFromPhoto(admin, jpeg, broke)).rejects.toThrow(/out of credit/);
    expect(bucket.objects.size).toBe(0);
    for (const spy of logs) spy.mockRestore();
  });

  it("lists professors with and without a face", async () => {
    await setFace(admin, "T1", png(256, 256));
    const missing = await facesPage("missing", "", undefined);
    expect(missing.counts).toMatchObject({ with: 1, missing: 1 });
    expect(missing.list.map((t) => t.name)).toEqual(["Emily Carter"]);
    const withFace = await facesPage("with", "", "T1");
    expect(withFace.selected).toMatchObject({ id: "T1", name: "Gonçalo Pinto", format: "PNG", face: expect.stringMatching(/^\/faces\/T1\?v=/) });
    expect((await facesPage("with", "пинто", undefined)).list.map((t) => t.id)).toEqual(["T1"]);
  });
});

