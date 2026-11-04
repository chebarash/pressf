import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  analyse,
  applyMapping,
  dayInWindow,
  describeExam,
  examChanges,
  isRoom,
  normRoom,
  parseCourses,
  parseDate,
  parseTime,
  readLabel,
  readSchedule,
  roomsLabel,
  SheetError,
  type Tab,
} from "@/core/exams";
import { readCsv, readHtmlTable, readUpload, readXlsx, sheetIdOf } from "@/lib/sheets";
import { calendarWindows, examWeekNote, hidingWindows } from "@/server/exams";

/** Synthetic sheets in the shapes the university uses. No real names or IDs. */
const WINDOW = { name: "Midterm", starts: "2026-11-02", ends: "2026-11-06" };

const slotGridTab: Tab = {
  name: "TimeTable",
  rows: [
    ["", "Slots", "Exam Rooms", "MATH 105", "MATH 106", "UCA204", "Slots"],
    ["", "Places -120", "Exam Starting Time", "40", "40", "15", "Places"],
    ["Monday", "M-1", "9:45 AM", "MATH111 Calculus 1 (120 min)", "MATH111 Calculus 1 (120 min)", "FINA330 Corporate Finance", "M-1"],
    ["Monday", "M-1", "9:45 AM", "40", "38", "12", ""],
    ["Monday", "M-2", "12:30 PM", "ECON330 Circular Economy", "CS412 Deep Learning", "", "M-2"],
    ["Monday", "M-2", "12:30 PM", "40", "33", "", ""],
    ["Tuesday", "T-1", "9:45 AM", "HASS101 Academic Skills 1", "", "CS412 Deep Learning", "T-1"],
    ["Tuesday", "T-1", "9:45 AM", "40", "", "5", ""],
    ["Thursday", "TH-2", "12:30 PM", "SE204 Cloud Computing", "", "", "TH-2"],
    ["Thursday", "TH-2", "12:30 PM", "20", "", "", ""],
  ],
};

const studentRowsTab: Tab = {
  name: "Room Distribution",
  rows: [
    ["", "", "Monday", "Monday", "Monday", "Monday", "Thursday", "Thursday"],
    ["", "", "M-1", "M-1", "M-2", "M-2", "TH-2", "TH-2"],
    ["ID", "Name", "9:45 AM", "Course", "12:30 PM", "Course", "12:30 PM", "Course"],
    ["100001", "Student A", "MATH 105", "MATH111 Calculus 1 (120 min)", "", "", "", ""],
    ["100002", "Student B", "", "", "MATH 106", "CS412 Deep Learning", "MATH 105", "SE204 Cloud Computing"],
    ["26M0001", "Student C", "UCA204", "FINA330 Corporate Finance", "", "", "", ""],
    ["100004", "Student D", "", "", "", "", "", ""],
  ],
};

const courseListTab: Tab = {
  name: "Finals",
  rows: [
    ["Final exams, Fall 2026"],
    ["Course code", "Course", "Date", "Start", "End", "Rooms"],
    ["CS412", "Deep Learning", "11.01.2027", "10:00", "12:00", "MATH 105, MATH 106"],
    ["MATH111", "Calculus 1", "2027-01-12", "2 PM", "", "UCA 204"],
  ],
};

describe("cells", () => {
  it("reads courses, durations and rooms", () => {
    expect(parseCourses("MATH111 Calculus 1 (120 min)")).toEqual([{ code: "MATH111", name: "Calculus 1", minutes: 120 }]);
    expect(parseCourses("CS 412 - Deep Learning")).toEqual([{ code: "CS412", name: "Deep Learning", minutes: null }]);
    expect(parseCourses("MATH 105")).toEqual([]);
    expect(parseCourses("CS412 Deep Learning / CS413 Vision").map((c) => c.code)).toEqual(["CS412", "CS413"]);
    expect(isRoom("MATH 105") && isRoom("UCA204") && isRoom("B14") && isRoom("MATH-B01") && isRoom("Conference Hall")).toBe(true);
    expect(isRoom("M-1") || isRoom("9:45 AM") || isRoom("Course")).toBe(false);
    expect([normRoom("UCA204"), normRoom("MATH-B01"), normRoom("math 106")]).toEqual(["UCA 204", "MATH B01", "MATH 106"]);
    expect(roomsLabel(["MATH 105", "MATH 106", "MATH 107", "MATH 110", "UCA 204", "Conference Hall"])).toBe("MATH 105–107, 110, UCA 204, Conference Hall");
  });

  it("parses times and dates", () => {
    expect(parseTime("9:45 AM")).toEqual({ start: "09:45", end: null });
    expect(parseTime("12:30 PM")).toEqual({ start: "12:30", end: null });
    expect(parseTime("3:00")).toEqual({ start: "15:00", end: null });
    expect(parseTime("09.45–11.45")).toEqual({ start: "09:45", end: "11:45" });
    expect(parseTime("2 PM")).toEqual({ start: "14:00", end: null });
    expect(parseTime("Room 12")).toBeNull();
    expect(parseDate("02.11.2026", 2026)).toBe("2026-11-02");
    expect(parseDate("Monday, 2 November", 2026)).toBe("2026-11-02");
    expect(parseDate("Nov 3", 2026)).toBe("2026-11-03");
    expect(parseDate("46328", 2026)).toBe("2026-11-02");
    expect(parseDate("9:45 AM", 2026)).toBeNull();
  });

  it("maps slot labels to the window's days", () => {
    expect(readLabel(["Monday", "M-2", "12:30 PM"], 2026)).toMatchObject({ weekday: 1, slot: "M-2", time: "12:30" });
    expect(readLabel(["TH-2"], 2026)).toMatchObject({ weekday: 4, slot: "TH-2", time: null });
    expect(dayInWindow(WINDOW, 4)).toBe("2026-11-05");
    expect(dayInWindow(WINDOW, 6)).toBeNull();
    expect(describeExam({ date: "2026-11-02", start: "12:30", minutes: 120, room: "MATH 106" })).toBe("Mon 2 Nov 12:30–14:30 · MATH 106");
  });
});

describe("analyser", () => {
  it("recognises a slot × room grid and a per-student sheet", () => {
    const { mapping, skipped } = analyse([slotGridTab, studentRowsTab, { name: "Notes", rows: [["Good luck!"]] }], WINDOW);
    expect(mapping.tabs.map((t) => [t.tab, t.layout])).toEqual([["TimeTable", "slot_grid"], ["Room Distribution", "student_rows"]]);
    expect(skipped).toEqual(["Notes"]);
    // The mapping keeps positions and header labels only, never a student's row.
    expect(JSON.stringify(mapping)).not.toMatch(/Student|100001/);
  });

  it("reads exams with dates, times, durations, rooms and seat counts", () => {
    const out = readSchedule([slotGridTab, studentRowsTab], WINDOW);
    const cs = out.exams.filter((e) => e.code === "CS412");
    expect(cs).toEqual([
      { code: "CS412", name: "Deep Learning", date: "2026-11-02", start: "12:30", minutes: 120, rooms: ["MATH 106"], seats: 33 },
      { code: "CS412", name: "Deep Learning", date: "2026-11-03", start: "09:45", minutes: 120, rooms: ["UCA 204"], seats: 5 },
    ]);
    expect(out.exams.find((e) => e.code === "MATH111")).toMatchObject({ date: "2026-11-02", start: "09:45", minutes: 120, rooms: ["MATH 105", "MATH 106"], seats: 78 });
    expect(out.exams.find((e) => e.code === "SE204")).toMatchObject({ date: "2026-11-05", start: "12:30" });
    expect(out.seats).toEqual([
      { studentId: "100001", code: "MATH111", name: "Calculus 1", date: "2026-11-02", start: "09:45", minutes: 120, room: "MATH 105" },
      { studentId: "100002", code: "CS412", name: "Deep Learning", date: "2026-11-02", start: "12:30", minutes: 120, room: "MATH 106" },
      { studentId: "100002", code: "SE204", name: "Cloud Computing", date: "2026-11-05", start: "12:30", minutes: 120, room: "MATH 105" },
      { studentId: "26M0001", code: "FINA330", name: "Corporate Finance", date: "2026-11-02", start: "09:45", minutes: 120, room: "UCA 204" },
    ]);
    expect(out.problems).toEqual([]);
  });

  it("takes slot times from the grid when the student sheet only names the slot", () => {
    const bare: Tab = { name: "Seats", rows: [["Student ID", "M-2", "M-2"], ["", "Room", "Course"], ["100009", "MATH 105", "ECON330 Circular Economy"], ["100010", "MATH 106", "CS412 Deep Learning"], ["100011", "", ""]] };
    const out = readSchedule([slotGridTab, bare], WINDOW);
    expect(out.seats.find((s) => s.studentId === "100010")).toMatchObject({ date: "2026-11-02", start: "12:30", room: "MATH 106" });
  });

  it("reads a per-course list with dates, time ranges and several rooms", () => {
    const out = readSchedule([courseListTab], { name: "Final", starts: "2027-01-11", ends: "2027-01-15" });
    expect(out.mapping.tabs[0].layout).toBe("course_list");
    expect(out.exams).toEqual([
      { code: "CS412", name: "Deep Learning", date: "2027-01-11", start: "10:00", minutes: 120, rooms: ["MATH 105", "MATH 106"], seats: null },
      { code: "MATH111", name: "Calculus 1", date: "2027-01-12", start: "14:00", minutes: 120, rooms: ["UCA 204"], seats: null },
    ]);
  });

  it("reuses a cached mapping, and re-analyses when the sheet changed shape", () => {
    const first = readSchedule([slotGridTab], WINDOW);
    expect(readSchedule([slotGridTab], WINDOW, first.mapping).reused).toBe(true);
    const renamed = { ...slotGridTab, name: "Timetable v2" };
    const again = readSchedule([renamed], WINDOW, first.mapping);
    expect(again.reused).toBe(false);
    expect(again.exams.length).toBe(first.exams.length);
  });

  it("refuses a sheet it can't read", () => {
    expect(() => readSchedule([{ name: "x", rows: [["hello"], ["world"]] }], WINDOW)).toThrow(SheetError);
    expect(() => applyMapping([slotGridTab], { v: 1, tabs: [{ tab: "Gone", layout: "slot_grid", roomRow: 0, roomCols: [3], labelCols: [0], dataFrom: 1 }] }, WINDOW)).toThrow(SheetError);
  });
});

describe("changes", () => {
  const a = { code: "CS412", date: "2026-11-02", start: "12:30", minutes: 120, room: "MATH 205" };
  it("reports room and time moves once per course", () => {
    expect(examChanges([a], [{ ...a, room: "MATH 106" }])).toEqual([{ code: "CS412", before: a, after: { ...a, room: "MATH 106" }, what: "room" }]);
    expect(examChanges([a], [{ ...a, start: "15:00" }])[0].what).toBe("time");
    expect(examChanges([a], [a])).toEqual([]);
    expect(examChanges([], [a])).toEqual([]);
  });
});

describe("exam windows", () => {
  it("come from the calendar's midterm and final weeks", () => {
    const list = calendarWindows();
    expect(list.find((w) => w.key === "midterm:2026-11-02")).toMatchObject({ kind: "midterm", starts: "2026-11-02", ends: "2026-11-07", classes: "hide" });
    expect(list.some((w) => w.kind === "final")).toBe(true);
    expect(hidingWindows(list, "2026-11-04", "2026-11-04").map((w) => w.key)).toEqual(["midterm:2026-11-02"]);
    expect(examWeekNote(list, "2026-11-04")).toBe("No regular classes during midterm week");
    expect(examWeekNote(list, "2026-11-10")).toBeNull();
    expect(examWeekNote(list.map((w) => ({ ...w, classes: "show" as const })), "2026-11-04")).toBeNull();
  });
});

/** A minimal .xlsx: workbook, rels, shared strings and one sheet with a merged cell. */
function xlsx(): Uint8Array {
  const files: Record<string, string> = {
    "xl/workbook.xml": `<workbook><sheets><sheet name="TimeTable" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>Monday</t></si><si><t>MATH 105</t></si><si><r><t>CS412 Deep </t></r><r><t>Learning</t></r></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>2</v></c></row><row r="3"><c r="B3"><v>40</v></c><c r="C3" t="inlineStr"><is><t>x &amp; y</t></is></c></row></sheetData><mergeCells><mergeCell ref="A2:A3"/></mergeCells></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData/></worksheet>`,
  };
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cdBuf, end]));
}

describe("sheet files", () => {
  it("reads .xlsx with shared strings, merges and hidden sheets left out", () => {
    const tabs = readXlsx(xlsx());
    expect(tabs.map((t) => t.name)).toEqual(["TimeTable"]);
    expect(tabs[0].rows).toEqual([["", "MATH 105", ""], ["Monday", "CS412 Deep Learning", ""], ["Monday", "40", "x & y"]]);
    expect(readUpload("Exams.xlsx", xlsx())[0].name).toBe("TimeTable");
  });

  it("reads CSV and a sheet's HTML view", () => {
    expect(readCsv('a,"b, c",d\n1,"say ""hi""",3\n')).toEqual([["a", "b, c", "d"], ["1", 'say "hi"', "3"]]);
    const html = `<table><thead><tr><th></th><th>A</th></tr></thead><tbody>
      <tr><th>1</th><td class="s1" rowspan="2">Monday</td><td>M-1</td><td colspan="2">MATH 105</td></tr>
      <tr><td class="freezebar-cell"></td></tr>
      <tr><th>2</th><td>M-2</td><td>CS412 &amp; co</td><td>x</td></tr></tbody></table>`;
    expect(readHtmlTable(html)).toEqual([["Monday", "M-1", "MATH 105", "MATH 105"], ["Monday", "M-2", "CS412 & co", "x"]]);
    expect(readUpload("rooms.csv", new TextEncoder().encode("ID,Room\n1,MATH 105"))).toEqual([{ name: "rooms", rows: [["ID", "Room"], ["1", "MATH 105"]] }]);
    expect(sheetIdOf("https://docs.google.com/spreadsheets/d/1bjNb-j4SqYTWjoFM5uRhviiJu2jBFgvsPZD9BhETvyI/edit?gid=0")).toBe("1bjNb-j4SqYTWjoFM5uRhviiJu2jBFgvsPZD9BhETvyI");
  });
});
