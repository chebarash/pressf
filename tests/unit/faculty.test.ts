import { describe, expect, it } from "vitest";
import { clean, cleanEmail, emailNames, groupDepartments, matchPeople, mergeProfile, nameScore, parseDepartments, tidyName, validateOverride } from "@/core/faculty";
import { words } from "@/core/search";

const HTML = `<select id="department" class="form-select">
  <option value="0" selected>Choose the department</option>
  <option value="77">Deans of Specialized Schools</option>
  <option value="52">School of Engineering</option>
  <option value="33">Department of Physics</option>
  <option value="70">Department of Chemical Engineering &amp; Materials Sciences</option>
  <option value="26">School of Computing</option>
  <option value="27">Department of Software Engineering</option>
  <option value="28">Department of AI</option>
  <option value="82">School of Medicine</option>
  <option value="40">Department of General Education</option>
</select><select id="professor"><option value="0">Choose the professor</option></select>`;

describe("faculty site departments", () => {
  it("parses the department options in order, entities decoded, placeholder dropped", () => {
    const list = parseDepartments(HTML);
    expect(list.map((d) => d.id)).toEqual([77, 52, 33, 70, 26, 27, 28, 82, 40]);
    expect(list[3].name).toBe("Department of Chemical Engineering & Materials Sciences");
  });

  it("puts each department under the school above it; deans and general education stand alone", () => {
    const units = groupDepartments(parseDepartments(HTML));
    const by = Object.fromEntries(units.map((u) => [u.id, u]));
    expect(by[77]).toMatchObject({ kind: "other", school: null });
    expect(by[52]).toMatchObject({ kind: "school", school: "School of Engineering" });
    expect(by[33]).toMatchObject({ kind: "department", school: "School of Engineering" });
    expect(by[28]).toMatchObject({ kind: "department", school: "School of Computing" });
    expect(by[40]).toMatchObject({ kind: "other", school: null });
  });

  it("cleans site values", () => {
    expect(tidyName("ARUNAVA ROY ")).toBe("Arunava Roy");
    expect(clean("x")).toBeNull();
    expect(clean(" 115 ")).toBe("115");
    expect(cleanEmail(" A.Roy@NewUU.uz ")).toBe("a.roy@newuu.uz");
    expect(cleanEmail("n/a")).toBeNull();
  });
});

const T = (id: string, firstName: string, surName: string, lastName: string | null = null) => ({ id, firstName, surName, lastName });

describe("matching site people to LMS teachers", () => {
  const teachers = [
    T("1", "Arunava", "Roy"),
    T("2", "Siyavushxon", "Kholmatov"),
    T("3", "Mohammad", "Sabokrou"),
    T("4", "Pavel", "Belov"),
    T("5", "Aleksandr", "Kapitonov"),
    T("6", "Dilshod", "Karimov"),
    T("7", "Dilshod", "Karimov"),
    T("8", "Heiko", "Topol"),
  ];

  it("matches either name order and ignores the patronymic", () => {
    const [a, b, c] = matchPeople(
      [
        { siteId: 641, name: "ARUNAVA ROY ", email: "a.roy@newuu.uz" },
        { siteId: 572, name: "MOHAMMAD SABOKROU EBRAHIM" },
        { siteId: 282, name: "Aleksandr Kapitonov Aleksandrovich" },
      ],
      teachers
    );
    expect(a).toMatchObject({ teacherId: "1", status: "matched" });
    expect(b).toMatchObject({ teacherId: "3", status: "matched" });
    expect(c).toMatchObject({ teacherId: "5", status: "matched" });
    // Surname first, as the kiosk lists many Uzbek names.
    expect(matchPeople([{ siteId: 9, name: "TOPOL HEIKO" }], teachers)[0].teacherId).toBe("8");
  });

  it("meets transliterations (Xolmatov = Kholmatov) and Cyrillic", () => {
    expect(words("Xolmatov", true)).toEqual(words("Kholmatov", true));
    const [r] = matchPeople([{ siteId: 597, name: "SIYAVUSHXON XOLMATOV FARRUXOVICH", email: "s.kholmatov@newuu.uz" }], teachers);
    expect(r).toMatchObject({ teacherId: "2", status: "matched" });
    expect(matchPeople([{ siteId: 10, name: "Павел Белов" }], teachers)[0].teacherId).toBe("4");
  });

  it("an email confirms a close spelling; without it a close spelling waits for the admin", () => {
    const lms = [T("2", "Siyavush", "Kholmatov")];
    expect(matchPeople([{ siteId: 1, name: "SIYAVUSHXON XOLMATOV", email: "s.kholmatov@newuu.uz" }], lms)[0]).toMatchObject({ teacherId: "2", status: "matched" });
    expect(matchPeople([{ siteId: 1, name: "SIYAVUSHXON XOLMATOV" }], lms)[0]).toMatchObject({ teacherId: null, status: "ambiguous", candidates: ["2"] });
  });

  it("never auto-links when two teachers fit or two people land on one teacher", () => {
    expect(matchPeople([{ siteId: 1, name: "KARIMOV DILSHOD" }], teachers)[0]).toMatchObject({ teacherId: null, status: "ambiguous", candidates: ["6", "7"] });
    const both = matchPeople([{ siteId: 1, name: "Pavel Belov" }, { siteId: 2, name: "BELOV PAVEL" }], teachers);
    expect(both.map((r) => r.status)).toEqual(["ambiguous", "ambiguous"]);
    // A teacher linked by hand is never taken automatically.
    expect(matchPeople([{ siteId: 3, name: "Pavel Belov" }], teachers, new Set(["4"]))[0].teacherId).toBeNull();
  });

  it("leaves unknown people unmatched, with an email-only suggestion", () => {
    expect(matchPeople([{ siteId: 1, name: "John Smith" }], teachers)[0]).toMatchObject({ teacherId: null, status: "unmatched", candidates: [] });
    expect(matchPeople([{ siteId: 1, name: "A. R.", email: "a.roy@newuu.uz" }], teachers)[0]).toMatchObject({ status: "unmatched", candidates: ["1"] });
  });

  it("needs both the given name and the family name", () => {
    expect(nameScore({ given: words("Arunava", true), family: words("Roy", true) }, "ARUNAVA").score).toBe(0);
    expect(nameScore({ given: words("Arunava", true), family: words("Roy", true) }, "ARUNAVA KUMAR").score).toBe(0);
  });

  it("reads emails as initial + surname", () => {
    const key = { givenRaw: "arunava", familyRaw: "roy", family: words("Roy", true) };
    expect(emailNames(key, "a.roy@newuu.uz")).toBe(true);
    expect(emailNames(key, "aroy@newuu.uz")).toBe(true);
    expect(emailNames(key, "b.roy@newuu.uz")).toBe(false);
    expect(emailNames(key, "a.ray@newuu.uz")).toBe(false);
  });
});

describe("profile precedence", () => {
  it("admin override > newuu.uz > LMS, empty values fall through", () => {
    const p = mergeProfile({ position: "Lecturer", department: "CS" }, { position: "Associate Professor", department: "Department of AI", office: "115", email: "a.roy@newuu.uz" }, { position: "Professor", office: "  ", hours: "Tue 14:00" });
    expect(p).toMatchObject({ position: "Professor", department: "Department of AI", office: "115", email: "a.roy@newuu.uz", hours: "Tue 14:00", note: null });
    expect(mergeProfile({ position: "Lecturer" }, null, null).position).toBe("Lecturer");
  });

  it("validates admin edits", () => {
    expect(validateOverride({ email: " A.Roy@newuu.uz ", office: "" })).toMatchObject({ email: "a.roy@newuu.uz", office: null });
    expect(() => validateOverride({ email: "a.roy@gmail.com" })).toThrow(/@newuu\.uz/);
    expect(() => validateOverride({ note: "x".repeat(281) })).toThrow(/too long/);
  });
});
