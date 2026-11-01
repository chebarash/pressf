import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { brandPdf } from "@/lib/telegram/brand";

const details = { courseCode: "MATH111", courseName: "Calculus 1", type: "midterm", term: "Fall 2023", hasSolutions: true };

async function sample(pages = 2, rotate = false) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) { const page = pdf.addPage([595, 842]); if (rotate) page.setRotation({ type: "degrees" as never, angle: 90 } as never); }
  return Buffer.from(await pdf.save());
}

describe("brandPdf", () => {
  it("adds a cover in front and keeps every page", async () => {
    const out = await PDFDocument.load(await brandPdf(await sample(3), details), { updateMetadata: false });
    expect(out.getPageCount()).toBe(4);
    expect(out.getTitle()).toContain("MATH111 Calculus 1");
    expect(out.getProducer()).toBe("Press F");
  });
  it("survives names the font cannot draw and rotated pages", async () => {
    const out = await brandPdf(await sample(1, true), { ...details, courseName: "Математика 1", term: null, author: "Meros" });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });
  it("refuses a file that is not a PDF", async () => {
    await expect(brandPdf(Buffer.from("not a pdf"), details)).rejects.toThrow();
  });
});
