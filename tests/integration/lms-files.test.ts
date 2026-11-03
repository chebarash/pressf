import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lms = vi.hoisted(() => ({ lesson: vi.fn(), downloadFile: vi.fn() }));
const storage = vi.hoisted(() => ({ putObject: vi.fn() }));
vi.mock("@/lib/lms/client", async (original) => ({
  ...(await original<typeof import("@/lib/lms/client")>()),
  lesson: lms.lesson,
  downloadFile: lms.downloadFile,
}));
vi.mock("@/lib/storage", () => ({ putObject: storage.putObject }));

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles, syllabi, syllabusQueue } from "@/lib/db/schema";
import { filesAreStale, harvestCourseFiles } from "@/lib/lms/files";
import { syllabus } from "../fixtures/catalog";
import { resetDb } from "../fixtures/db";

const session = { token: "t" };
const material = (id: string, name: string, version = "1") => ({ id, name, file_extension: "pdf", file_version: version, fileFullUrl: `/v1/file/${id}` });

beforeEach(async () => {
  await resetDb();
  lms.lesson.mockReset();
  lms.downloadFile.mockReset().mockResolvedValue({ bytes: Buffer.from("PDF"), contentType: "application/pdf" });
  storage.putObject.mockReset().mockImplementation(async (key: string) => key);
  await db().insert(lmsCourses).values({ id: "906", code: "CS412", name: "Deep Learning", raw: { lessons: [{ id: "L1" }, { id: "L2" }] } });
});
afterEach(() => vi.clearAllMocks());

describe("harvestCourseFiles", () => {
  it("downloads a course's lesson materials into the bucket once", async () => {
    lms.lesson.mockImplementation(async (_s, id: string) =>
      id === "L1" ? { lessonMaterials: [material("3344", "Week 1.pdf")] } : { lessonMaterials: [material("3577", "Notes.pdf")] }
    );
    const r = await harvestCourseFiles(session, "906");
    expect(r.files).toBe(2);
    expect(storage.putObject).toHaveBeenCalledTimes(2);
    const rows = await db().select().from(lmsFiles).where(eq(lmsFiles.code, "CS412"));
    expect(rows.map((f) => f.name).sort()).toEqual(["Notes.pdf", "Week 1.pdf"]);
    expect(rows[0].storageKey).toMatch(/^lms\/906\//);
    // Marked fresh.
    expect(await filesAreStale("906")).toBe(false);
  });

  it("does not re-download a file whose version is unchanged", async () => {
    lms.lesson.mockImplementation(async (_s, id: string) => (id === "L1" ? { lessonMaterials: [material("3344", "Week 1.pdf", "1")] } : { lessonMaterials: [] }));
    await harvestCourseFiles(session, "906");
    storage.putObject.mockClear();
    lms.downloadFile.mockClear();
    await harvestCourseFiles(session, "906");
    expect(lms.downloadFile).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(await db().select().from(lmsFiles)).toHaveLength(1);
  });

  it("re-downloads when the LMS file version changes", async () => {
    lms.lesson.mockImplementation(async (_s, id: string) => (id === "L1" ? { lessonMaterials: [material("3344", "Week 1.pdf", "1")] } : { lessonMaterials: [] }));
    await harvestCourseFiles(session, "906");
    lms.lesson.mockImplementation(async (_s, id: string) => (id === "L1" ? { lessonMaterials: [material("3344", "Week 1 v2.pdf", "2")] } : { lessonMaterials: [] }));
    storage.putObject.mockClear();
    await harvestCourseFiles(session, "906");
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    const [row] = await db().select().from(lmsFiles).where(eq(lmsFiles.id, "3344"));
    expect(row.name).toBe("Week 1 v2.pdf");
  });

  it("queues the syllabus PDF for the operator instead of parsing it", async () => {
    lms.lesson.mockImplementation(async (_s, id: string) => (id === "L1" ? { lessonMaterials: [material("3344", "Week 1.pdf"), material("4400", "CS412 Syllabus.pdf")] } : { lessonMaterials: [] }));
    await harvestCourseFiles(session, "906");
    // Downloaded once into the bucket like any file, never fetched again to be read.
    expect(lms.downloadFile).toHaveBeenCalledTimes(2);
    expect(await db().select().from(syllabusQueue)).toEqual([
      expect.objectContaining({ courseCode: "CS412", sourceKey: "lms:4400", fileId: "4400", name: "CS412 Syllabus.pdf", origin: "lms", storageKey: expect.stringMatching(/^lms\/906\/4400\.pdf$/) }),
    ]);
    // Again: still one item. Once parsed, it is not queued again.
    await harvestCourseFiles(session, "906");
    expect(await db().select().from(syllabusQueue)).toHaveLength(1);
    await db().delete(syllabusQueue);
    await db().insert(syllabi).values({ courseCode: "CS412", sourceName: "lms:4400", data: syllabus({ course_code: "CS 412" }), matched: true });
    await harvestCourseFiles(session, "906");
    expect(await db().select().from(syllabusQueue)).toHaveLength(0);
  });
});
