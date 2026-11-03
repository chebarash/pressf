import { describe, expect, it } from "vitest";
import { lmsDay } from "@/lib/lms/semesters";
import { keyName } from "@/platform/keys";
import { semesterRows } from "@/server/sync/convert";

describe("shortcuts ignore the keyboard layout", () => {
  it("reads letters, digits and ? from the physical key", () => {
    expect(keyName({ key: "п", code: "KeyG", shiftKey: false })).toBe("g");
    expect(keyName({ key: "р", code: "KeyH", shiftKey: false })).toBe("h");
    expect(keyName({ key: "1", code: "Digit1", shiftKey: false })).toBe("1");
    expect(keyName({ key: ",", code: "Slash", shiftKey: true })).toBe("?");
    expect(keyName({ key: "Escape", code: "Escape", shiftKey: false })).toBe("Escape");
  });
});

describe("LMS semester dates", () => {
  it("turns unix seconds, ms, dotted and ISO dates into a day", () => {
    expect(lmsDay(1765843200)).toBe("2025-12-16");
    expect(lmsDay("20.12.2025")).toBe("2025-12-20");
    expect(lmsDay("2025-12-20 00:00:00")).toBe("2025-12-20");
    expect(lmsDay("2025-12-20")).toBe("2025-12-20");
    expect(lmsDay(null)).toBeNull();
  });
  it("stores semester start and end as days whatever the LMS sends", () => {
    const [s] = semesterRows([{ id: 1, semester_id: 7, semester_name: "Fall 2025", is_open: 0, study_start: 1756684800 as unknown as string, study_end: 1765843200 as unknown as string }]);
    expect(s.starts).toBe("2025-09-01");
    expect(s.ends).toBe("2025-12-16");
  });
});
