import { renderPng } from "./draw";
import { fmtDate, sourceLine, weekLine, type CoverMeta } from "./meta";
import { coverScene } from "./pdf";
import { entryText, makeEntry, readZip, replaceEntry, writeZip, type ZipEntry } from "./zip";

/**
 * Word, PowerPoint and Excel covers, done on the Office Open XML package
 * directly (a zip of XML parts). Original parts are copied untouched; we only
 * add our parts and the few references to them (relationships, content
 * types, the body/slide/sheet lists). Anything unexpected returns null and the
 * caller keeps the original file.
 */

const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const T_IMAGE = `${NS_REL}/image`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Pkg = { entries: ZipEntry[]; get(name: string): ZipEntry | undefined; text(name: string): string | null; set(name: string, data: Uint8Array | string): void; save(): Uint8Array };

function pkg(bytes: Uint8Array): Pkg | null {
  const entries = readZip(bytes);
  if (!entries || !entries.some((e) => e.name === "[Content_Types].xml")) return null;
  const list = [...entries];
  const get = (name: string) => list.find((e) => e.name === name);
  return {
    entries: list,
    get,
    text: (name) => {
      const e = get(name);
      return e ? entryText(e) : null;
    },
    set(name, data) {
      const i = list.findIndex((e) => e.name === name);
      if (i >= 0) list[i] = replaceEntry(list[i], data);
      else list.push(makeEntry(name, data));
    },
    save: () => writeZip(list),
  };
}

function addRel(xml: string, id: string, type: string, target: string) {
  return xml.replace(/<\/Relationships>\s*$/, `<Relationship Id="${id}" Type="${type}" Target="${esc(target)}"/></Relationships>`);
}

function freeId(xml: string, base: string) {
  let id = base;
  for (let i = 2; new RegExp(`Id="${id}"`).test(xml); i++) id = `${base}${i}`;
  return id;
}

function addContentType(xml: string, opts: { ext?: [string, string]; override?: [string, string] }) {
  if (opts.ext && !new RegExp(`<Default[^>]*Extension="${opts.ext[0]}"`, "i").test(xml)) {
    xml = xml.replace(/<\/Types>\s*$/, `<Default Extension="${opts.ext[0]}" ContentType="${opts.ext[1]}"/></Types>`);
  }
  if (opts.override) xml = xml.replace(/<\/Types>\s*$/, `<Override PartName="${opts.override[0]}" ContentType="${opts.override[1]}"/></Types>`);
  return xml;
}

/** Renders the cover for a page of w×h points as PNG at 2× (for print quality inside Office files). */
async function coverImage(meta: CoverMeta, w: number, h: number, pages?: number | null) {
  const { scene } = coverScene(meta, w, h, pages);
  return renderPng(scene, Math.round(w * 2));
}

const EMU = 12700; // per point

/* ---------- Word ---------- */

/** Prepends a cover page in its own section, sized like the document's first section. */
export async function brandDocx(bytes: Uint8Array, meta: CoverMeta): Promise<Uint8Array | null> {
  const p = pkg(bytes);
  if (!p) return null;
  const doc = p.text("word/document.xml");
  const rels = p.text("word/_rels/document.xml.rels");
  const types = p.text("[Content_Types].xml");
  if (!doc || !rels || !types) return null;
  const body = doc.match(/<w:body(\s[^>]*)?>/);
  const sect = doc.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/);
  if (!body || body.index == null) return null;
  const size = sect?.[0].match(/<w:pgSz\b[^>]*>/)?.[0] ?? "";
  const attr = (n: string) => Number(size.match(new RegExp(`w:${n}="(\\d+)"`))?.[1] ?? 0);
  const wTw = attr("w") || 11906;
  const hTw = attr("h") || 16838;
  const w = wTw / 20;
  const h = hTw / 20;

  const png = await coverImage(meta, w, h, null);
  const name = "word/media/pressf-cover.png";
  const rid = freeId(rels, "rIdPressFCover");
  const cx = Math.round(w * EMU);
  const cy = Math.round(h * EMU);
  const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
  const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
  const drawing =
    `<w:drawing><wp:anchor xmlns:wp="${NS_WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="31337" name="Press F cover" descr="${esc(meta.title)} — ${esc(meta.courseName)}"/>` +
    `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="0" name="pressf-cover.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="${NS_REL}" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>`;
  const orient = w > h ? ` w:orient="landscape"` : "";
  const cover =
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>` +
    `<w:sectPr><w:pgSz w:w="${wTw}" w:h="${hTw}"${orient}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:pPr>` +
    `<w:r>${drawing}</w:r></w:p>`;
  const at = body.index + body[0].length;
  p.set("word/document.xml", doc.slice(0, at) + cover + doc.slice(at));
  p.set(name, png);
  p.set("word/_rels/document.xml.rels", addRel(rels, rid, T_IMAGE, "media/pressf-cover.png"));
  p.set("[Content_Types].xml", addContentType(types, { ext: ["png", "image/png"] }));
  return p.save();
}

/* ---------- PowerPoint ---------- */

/** Inserts the cover as slide 1, in the deck's own slide size. */
export async function brandPptx(bytes: Uint8Array, meta: CoverMeta): Promise<Uint8Array | null> {
  const p = pkg(bytes);
  if (!p) return null;
  const pres = p.text("ppt/presentation.xml");
  const presRels = p.text("ppt/_rels/presentation.xml.rels");
  const types = p.text("[Content_Types].xml");
  if (!pres || !presRels || !types) return null;
  const sz = pres.match(/<p:sldSz\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  const list = pres.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/);
  if (!sz || !list) return null;
  const cx = Number(sz[1]);
  const cy = Number(sz[2]);
  const slides = [...list[1].matchAll(/<p:sldId\b[^>]*id="(\d+)"[^>]*r:id="([^"]+)"/g)];
  if (!slides.length) return null;
  // The first slide's layout, so the new slide inherits the deck's master.
  const firstTarget = presRels.match(new RegExp(`<Relationship\\b[^>]*Id="${slides[0][2]}"[^>]*Target="([^"]+)"`))?.[1] ?? presRels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${slides[0][2]}"`))?.[1];
  if (!firstTarget) return null;
  const firstName = `ppt/${firstTarget.replace(/^\/?ppt\//, "").replace(/^\//, "")}`;
  const firstRels = p.text(firstName.replace(/slides\/(.+)$/, "slides/_rels/$1.rels"));
  const layout = firstRels?.match(/Target="([^"]*slideLayouts\/[^"]+)"/)?.[1];
  if (!layout) return null;

  const png = await coverImage(meta, cx / EMU, cy / EMU, slides.length);
  const slideName = "ppt/slides/pressf-cover.xml";
  if (p.get(slideName)) return null;
  const slideXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld name="Press F"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Press F cover" descr="${esc(meta.title)} — ${esc(meta.courseName)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slideRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS_REL}/slideLayout" Target="${esc(layout)}"/>` +
    `<Relationship Id="rId2" Type="${T_IMAGE}" Target="../media/pressf-cover.png"/></Relationships>`;
  const rid = freeId(presRels, "rIdPressFCover");
  const ids = slides.map((s) => Number(s[1]));
  const id = Math.max(...ids, 255) + 1;
  const newPres = pres.replace("<p:sldIdLst>", `<p:sldIdLst><p:sldId id="${id}" r:id="${rid}"/>`);
  p.set("ppt/presentation.xml", newPres);
  p.set("ppt/_rels/presentation.xml.rels", addRel(presRels, rid, `${NS_REL}/slide`, "slides/pressf-cover.xml"));
  p.set(slideName, slideXml);
  p.set("ppt/slides/_rels/pressf-cover.xml.rels", slideRels);
  p.set("ppt/media/pressf-cover.png", png);
  p.set("[Content_Types].xml", addContentType(types, { ext: ["png", "image/png"], override: ["/ppt/slides/pressf-cover.xml", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"] }));
  return p.save();
}

/* ---------- Excel ---------- */

export const ABOUT_SHEET = "Press F · About";

/** Rows of the About sheet (Cover/Sheet · About). */
export function aboutRows(meta: CoverMeta, sheets: string[]): Array<[string, string]> {
  const rows: Array<[string, string | null]> = [
    ["File", meta.title],
    ["Course", [meta.courseCode ? `${meta.courseName} (${meta.courseCode})` : meta.courseName, meta.term].filter(Boolean).join(" · ")],
    ["Week", weekLine(meta)],
    ["Source", meta.source === "lms" ? ["NewUU LMS", meta.teacher, meta.uploadedAt ? fmtDate(meta.uploadedAt) : null].filter(Boolean).join(" · ") : sourceLine(meta)],
    ["Sheets", `${sheets.join(", ")} — unchanged`],
    ["Open in Press F", meta.url.replace(/^https?:\/\//, "")],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

/** Adds a first sheet "Press F · About"; the original sheets follow untouched, formulas intact. */
export async function brandXlsx(bytes: Uint8Array, meta: CoverMeta): Promise<Uint8Array | null> {
  const p = pkg(bytes);
  if (!p) return null;
  const wb = p.text("xl/workbook.xml");
  const wbRels = p.text("xl/_rels/workbook.xml.rels");
  const types = p.text("[Content_Types].xml");
  const styles = p.text("xl/styles.xml");
  if (!wb || !wbRels || !types || !styles) return null;
  const sheetTags = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => m[0]);
  if (!sheetTags.length || wb.includes(`name="${esc(ABOUT_SHEET)}"`)) return null;
  const names = sheetTags.map((t) => t.match(/name="([^"]*)"/)?.[1] ?? "").map((n) => n.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
  const sheetIds = sheetTags.map((t) => Number(t.match(/sheetId="(\d+)"/)?.[1] ?? 0));

  // Styles: title (serif on teal), label (semibold), value, link (accent).
  const st = addStyles(styles);
  if (!st) return null;

  const rid = freeId(wbRels, "rIdPressFAbout");
  const sheetTag = `<sheet name="${esc(ABOUT_SHEET)}" sheetId="${Math.max(...sheetIds) + 1}" r:id="${rid}"/>`;
  let newWb = wb.replace(/<sheets>/, `<sheets>${sheetTag}`);
  // Indices shift by one: local defined names and the active tab.
  newWb = newWb.replace(/localSheetId="(\d+)"/g, (_, n: string) => `localSheetId="${Number(n) + 1}"`);
  // Without a view, tab 0 (ours) would open next to a sheet marked selected: Excel would group them.
  if (!/<workbookView\b/.test(newWb)) newWb = newWb.replace("<sheets>", `<bookViews><workbookView activeTab="1"/></bookViews><sheets>`);
  else newWb = newWb.replace(/<workbookView\b([^>]*?)(\/?)>/, (_m, a: string, close: string) => {
    let attrs = a;
    attrs = /activeTab="\d+"/.test(attrs) ? attrs.replace(/activeTab="(\d+)"/, (_x, n: string) => `activeTab="${Number(n) + 1}"`) : `${attrs} activeTab="1"`;
    return `<workbookView${attrs}${close}>`;
  });
  if (!newWb.includes(sheetTag)) return null;

  const rows = aboutRows(meta, names);
  const cell = (ref: string, s: number, v?: string) => (v == null ? `<c r="${ref}" s="${s}"/>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
  const xmlRows: string[] = [];
  xmlRows.push(`<row r="1" ht="31" customHeight="1">${cell("A1", st.title, "Press F")}${cell("B1", st.titleFill)}</row>`);
  rows.forEach(([k, v], i) => {
    const r = i + 2;
    xmlRows.push(`<row r="${r}" ht="25" customHeight="1">${cell(`A${r}`, st.label, k)}${cell(`B${r}`, k === "Open in Press F" ? st.link : st.value, v)}</row>`);
  });
  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_REL}">` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="25" customHeight="1"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="80" customWidth="1"/></cols>` +
    `<sheetData>${xmlRows.join("")}</sheetData>` +
    (meta.url ? `<hyperlinks><hyperlink ref="B${rows.findIndex(([k]) => k === "Open in Press F") + 2}" r:id="rId1"/></hyperlinks>` : "") +
    `</worksheet>`;
  const sheetRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS_REL}/hyperlink" Target="${esc(meta.url)}" TargetMode="External"/></Relationships>`;

  p.set("xl/workbook.xml", newWb);
  p.set("xl/styles.xml", st.xml);
  p.set("xl/_rels/workbook.xml.rels", addRel(wbRels, rid, `${NS_REL}/worksheet`, "worksheets/pressf-about.xml"));
  p.set("xl/worksheets/pressf-about.xml", sheetXml);
  p.set("xl/worksheets/_rels/pressf-about.xml.rels", sheetRels);
  p.set("[Content_Types].xml", addContentType(types, { override: ["/xl/worksheets/pressf-about.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"] }));
  return p.save();
}

/** Appends our fonts, fills and cell formats to styles.xml; returns their indices. */
function addStyles(xml: string) {
  const block = (tag: string) => xml.match(new RegExp(`<${tag}\\b[^>]*count="(\\d+)"[^>]*>([\\s\\S]*?)</${tag}>`));
  const fonts = block("fonts");
  const fills = block("fills");
  const xfs = block("cellXfs");
  if (!fonts || !fills || !xfs) return null;
  const nFonts = (fonts[2].match(/<font\b/g) ?? []).length;
  const nFills = (fills[2].match(/<fill\b/g) ?? []).length;
  const nXfs = (xfs[2].match(/<xf\b/g) ?? []).length;
  const color = (hex: string) => `FF${hex.replace("#", "").slice(0, 6).toUpperCase()}`;
  const newFonts = [
    `<font><sz val="20"/><color rgb="${color("#12120d")}"/><name val="Instrument Serif"/></font>`,
    `<font><b/><sz val="12"/><color rgb="${color("#12120d")}"/><name val="Geologica"/></font>`,
    `<font><sz val="12"/><color rgb="${color("#12120d")}"/><name val="Geologica"/></font>`,
    `<font><u/><sz val="12"/><color rgb="${color("#163c45")}"/><name val="Geologica"/></font>`,
  ];
  const newFills = [`<fill><patternFill patternType="solid"><fgColor rgb="${color("#d5e5e1")}"/><bgColor indexed="64"/></patternFill></fill>`];
  const f = nFonts;
  const fill = nFills;
  const xf = (font: number, fl: number) => `<xf numFmtId="0" fontId="${font}" fillId="${fl}" borderId="0" xfId="0" applyFont="1"${fl ? ` applyFill="1"` : ""}><alignment vertical="center"/></xf>`;
  const newXfs = [xf(f, fill), xf(f + 2, fill), xf(f + 1, 0), xf(f + 2, 0), xf(f + 3, 0)];
  const swap = (s: string, m: RegExpMatchArray, tag: string, add: string[], n: number) =>
    s.replace(m[0], m[0].replace(/count="\d+"/, `count="${n + add.length}"`).replace(`</${tag}>`, `${add.join("")}</${tag}>`));
  let out = swap(xml, fonts, "fonts", newFonts, nFonts);
  out = swap(out, out.match(new RegExp(`<fills\\b[^>]*count="(\\d+)"[^>]*>([\\s\\S]*?)</fills>`))!, "fills", newFills, nFills);
  out = swap(out, out.match(new RegExp(`<cellXfs\\b[^>]*count="(\\d+)"[^>]*>([\\s\\S]*?)</cellXfs>`))!, "cellXfs", newXfs, nXfs);
  return { xml: out, title: nXfs, titleFill: nXfs + 1, label: nXfs + 2, value: nXfs + 3, link: nXfs + 4 };
}

