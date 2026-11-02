import { PDFArray, PDFDocument, PDFName, PDFRawStream, rgb, StandardFonts, type PDFPage } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { brandFile, brandZip, coverPng, coverScene, type CoverMeta } from "@/server/covers";
import { brandDocx, brandPptx, brandXlsx } from "@/server/covers/office";
import { brandPdf } from "@/server/covers/pdf";
import { brandImage, imageSize } from "@/server/covers/image";
import { README_NAME } from "@/server/covers/scenes";
import { brandedCopy, type BrandStore } from "@/server/covers/store";
import { titleLines } from "@/server/covers/text";
import { entryData, entryText, makeEntry, readZip, writeZip } from "@/server/covers/zip";
import { renderPng } from "@/server/covers/draw";

const meta: CoverMeta = {
  title: "Limits and continuity",
  courseName: "Calculus 1",
  courseCode: "MATH 111",
  term: "Fall 2026",
  source: "lms",
  kind: "Lecture",
  week: 2,
  teacher: "Gonçalo Pinto",
  teacherRole: "lecture",
  uploadedAt: new Date("2026-09-08T10:00:00Z"),
  url: "https://pressf.chebarash.uz/f/8812",
};

async function samplePdf(pages: Array<[number, number]>) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawText(`Original page ${i + 1}`, { x: 60, y: h - 80, size: 18, font, color: rgb(0, 0, 0) });
  });
  return doc.save();
}

/** Decoded content of a page, to compare originals byte for byte. */
function contents(doc: PDFDocument, page: PDFPage) {
  const ref = page.node.get(PDFName.of("Contents"));
  const obj = doc.context.lookup(ref);
  const streams = obj instanceof PDFArray ? obj.asArray().map((r) => doc.context.lookup(r)) : [obj];
  return streams.map((s) => Buffer.from((s as PDFRawStream).contents).toString("base64")).join("|");
}

describe("PDF covers", () => {
  it("prepends one cover and keeps the original pages untouched", async () => {
    const input = await samplePdf([[595.28, 841.89], [595.28, 841.89], [595.28, 841.89]]);
    const out = await brandPdf(input, meta);
    const before = await PDFDocument.load(input);
    const after = await PDFDocument.load(out);
    expect(after.getPageCount()).toBe(before.getPageCount() + 1);
    before.getPages().forEach((p, i) => {
      const q = after.getPage(i + 1);
      expect(contents(after, q)).toBe(contents(before, p));
      expect(q.getSize()).toEqual(p.getSize());
    });
    // The cover takes page 1's size and orientation.
    expect(after.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });

  it("uses the slide cover for a landscape first page", async () => {
    const input = await samplePdf([[842, 595], [842, 595]]);
    const after = await PDFDocument.load(await brandPdf(input, meta));
    expect(after.getPageCount()).toBe(3);
    expect(after.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
    expect(coverScene(meta, 842, 595).scene.w).toBeGreaterThan(coverScene(meta, 842, 595).scene.h);
    expect(coverScene(meta, 595, 842).scene.w).toBe(595);
  });

  it("adds page stamps only where the bottom margin is measurable", async () => {
    const input = await samplePdf([[595, 842], [595, 842]]);
    const before = await PDFDocument.load(input);
    const after = await PDFDocument.load(await brandPdf(input, meta, { stamp: true }));
    expect(after.getPageCount()).toBe(3);
    // Text ends near the top, so both pages get a stamp in a separate stream; their own stream is kept as is.
    for (let i = 0; i < 2; i++) {
      const streams = contents(after, after.getPage(i + 1)).split("|");
      expect(streams).toContain(contents(before, before.getPage(i)));
      expect(streams.length).toBeGreaterThan(1);
    }
  });

  it("returns unreadable input unchanged", async () => {
    const junk = new TextEncoder().encode("not a pdf");
    expect(await brandPdf(junk, meta)).toBe(junk);
    const r = await brandFile(junk, { name: "x.pdf" }, meta);
    expect(r.branded).toBe(false);
    expect(r.bytes).toBe(junk);
  });
});

describe("other formats", () => {
  it("adds the README to a zip without touching the rest", async () => {
    const zip = writeZip([makeEntry("main.py", "print(1)\n"), makeEntry("data/input.csv", "a,b\n1,2\n", { store: true })]);
    const out = (await brandZip(zip, meta))!;
    const entries = readZip(out)!;
    expect(entries.map((e) => e.name)).toEqual([README_NAME, "main.py", "data/input.csv"]);
    const orig = readZip(zip)!;
    expect(Buffer.from(entries[1].raw)).toEqual(Buffer.from(orig[0].raw));
    expect(entryText(entries[2])).toBe("a,b\n1,2\n");
    expect((await PDFDocument.load(entryData(entries[0]))).getPageCount()).toBe(1);
  });

  const types = (parts: string) => `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>${parts}</Types>`;
  const rels = (r: string) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r}</Relationships>`;

  it("puts a cover section in front of a Word document", async () => {
    const body = `<w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`;
    const docx = writeZip([
      makeEntry("[Content_Types].xml", types("")),
      makeEntry("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
      makeEntry("word/_rels/document.xml.rels", rels("")),
    ]);
    const out = readZip((await brandDocx(docx, meta))!)!;
    const doc = entryText(out.find((e) => e.name === "word/document.xml")!);
    expect(doc).toContain(body);
    expect(doc.indexOf("<w:drawing>")).toBeLessThan(doc.indexOf("Hello"));
    expect(out.some((e) => e.name === "word/media/pressf-cover.png")).toBe(true);
    expect(entryText(out.find((e) => e.name === "[Content_Types].xml")!)).toContain('Extension="png"');
  });

  it("inserts slide 1 in a PowerPoint deck", async () => {
    const pptx = writeZip([
      makeEntry("[Content_Types].xml", types("")),
      makeEntry("ppt/presentation.xml", `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`),
      makeEntry("ppt/_rels/presentation.xml.rels", rels(`<Relationship Id="rId2" Type="slide" Target="slides/slide1.xml"/>`)),
      makeEntry("ppt/slides/slide1.xml", "<p:sld/>"),
      makeEntry("ppt/slides/_rels/slide1.xml.rels", rels(`<Relationship Id="rId1" Type="slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`)),
    ]);
    const out = readZip((await brandPptx(pptx, meta))!)!;
    const pres = entryText(out.find((e) => e.name === "ppt/presentation.xml")!);
    expect(pres).toMatch(/<p:sldIdLst><p:sldId id="257" r:id="rIdPressFCover"\/><p:sldId id="256"/);
    expect(entryText(out.find((e) => e.name === "ppt/slides/slide1.xml")!)).toBe("<p:sld/>");
    expect(out.some((e) => e.name === "ppt/slides/pressf-cover.xml")).toBe(true);
  });

  it("adds an About sheet first and shifts sheet indices", async () => {
    const xlsx = writeZip([
      makeEntry("[Content_Types].xml", types("")),
      makeEntry("xl/workbook.xml", `<workbook xmlns:r="r"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Grades" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Grades!$A$1:$B$2</definedName></definedNames></workbook>`),
      makeEntry("xl/_rels/workbook.xml.rels", rels(`<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>`)),
      makeEntry("xl/styles.xml", `<styleSheet><fonts count="1"><font/></fonts><fills count="2"><fill/><fill/></fills><cellXfs count="1"><xf/></cellXfs></styleSheet>`),
      makeEntry("xl/worksheets/sheet1.xml", "<worksheet><sheetData><row r=\"1\"><c r=\"A1\"><f>1+1</f></c></row></sheetData></worksheet>"),
    ]);
    const out = readZip((await brandXlsx(xlsx, meta))!)!;
    const wb = entryText(out.find((e) => e.name === "xl/workbook.xml")!);
    expect(wb).toMatch(/<sheets><sheet name="Press F · About" sheetId="2"/);
    expect(wb).toContain('localSheetId="1"');
    expect(wb).toContain('activeTab="1"');
    expect(entryText(out.find((e) => e.name === "xl/worksheets/sheet1.xml")!)).toContain("<f>1+1</f>");
    expect(entryText(out.find((e) => e.name === "xl/styles.xml")!)).toContain('<cellXfs count="6">');
  });

  it("frames an image without resizing it", async () => {
    const png = await renderPng({ w: 300, h: 200, prims: [{ k: "rect", x: 0, y: 0, w: 300, h: 200, fill: "#ffffff" }] }, 300);
    const out = (await brandImage(png, meta))!;
    const size = imageSize(out)!;
    expect(size.width).toBe(300 + 24);
    expect(size.height).toBe(200 + 24 + 10 + 26);
  });

  it("keeps audio and video as they are", async () => {
    const b = new Uint8Array([1, 2, 3]);
    const r = await brandFile(b, { name: "lecture.mp4" }, meta);
    expect(r.branded).toBe(false);
    expect(r.bytes).toBe(b);
  });

  it("renders the cover as a Telegram-sized PNG", async () => {
    const size = imageSize(await coverPng(meta))!;
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(320);
  });

  it("breaks titles after a comma like the design", () => {
    expect(titleLines("Midterm exam, Fall 2025", "serif", 84, 697)).toEqual(["Midterm exam,", "Fall 2025"]);
  });
});

describe("stored branded copies", () => {
  it("brands once and reuses the stored copy", async () => {
    const saved = new Map<string, Uint8Array>();
    let loads = 0;
    const store: BrandStore = { exists: async (k) => saved.has(k), put: async (k, b) => saved.set(k, b), url: async (k) => `https://bucket/${k}` };
    const input = await samplePdf([[595, 842]]);
    const file = { sha256: "abc", name: "Week 2.pdf", load: async () => (loads++, input) };
    const a = await brandedCopy(file, meta, { store });
    const b = await brandedCopy(file, meta, { store });
    expect(a?.key).toMatch(/^branded\/v\d+\/abc-[0-9a-f]{12}\.pdf$/);
    expect(b?.key).toBe(a?.key);
    expect(loads).toBe(1);
    expect(await brandedCopy({ ...file, name: "talk.mp3" }, meta, { store })).toBeNull();
  });
});
