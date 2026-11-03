import { describe, expect, it } from "vitest";
import { compileMatcher, courseVariants, linkKey, tokens, type MatcherInput } from "@/core/mentions";

const courses: MatcherInput["courses"] = [
  { code: "MATH111", name: "Calculus 1" },
  { code: "MATH112", name: "Calculus 2" },
  // A one-word "Calculus" next to Calculus 1 and 2: "calculus" alone could be any of them.
  { code: "MATH20", name: "Calculus" },
  { code: "CS30", name: "Introduction to Data Science" },
  { code: "CS40", name: "Data Science Fundamentals" },
  { code: "PHYS101", name: "Physics I" },
  { code: "CS102", name: "Computer Programming 2" },
  { code: "ECE201", name: "Digital Logic Design" },
  { code: "ENG101", name: "Academic and Communication Skills 1" },
  { code: "ENG102", name: "Academic and Communication Skills 2" },
  { code: "MATH201", name: "Linear Algebra" },
  { code: "ECON101", name: "Introduction to Microeconomics" },
  { code: "ECON201", name: "Microeconomics 2" },
  { code: "MSE301", name: "Nanotechnology and Advanced Materials Engineering" },
  { code: "STAT201", name: "Statistics" },
  { code: "MATH300", name: "Econometrics" },
  // Two codes, one name: the name means neither.
  { code: "BIO101", name: "General Biology" },
  { code: "BIO102", name: "General Biology" },
];

const teachers: MatcherInput["teachers"] = [
  { id: "36", firstName: "Gonçalo", surName: "Pinto" },
  { id: "167", firstName: "Abduaziz", surName: "Kayumov", lastName: "Farruxovich" },
  { id: "66", firstName: "Bahodir", surName: "Kayumov" },
  { id: "214", firstName: "Siyavushxon", surName: "Xolmatov" },
  { id: "13", firstName: "Yuliya", surName: "Durova" },
  { id: "8", firstName: "Sanghyuk", surName: "Lee" },
  { id: "136", firstName: "Jung Jin", surName: "Lee" },
  // Two LMS records of one person, merged: 900 → 901.
  { id: "900", firstName: "Anna", surName: "Tomskova" },
  { id: "901", firstName: "Anna", surName: "Tomskova" },
  // The LMS has no family name; an admin wrote the display name.
  { id: "77", firstName: "Rasim", lastName: null, surName: null, displayName: "Rasim Mutlu" },
  // Same full name twice, not merged: ambiguous.
  { id: "50", firstName: "Aziz", surName: "Rakhimov" },
  { id: "51", firstName: "Aziz", surName: "Rakhimov" },
];

const m = compileMatcher({ courses, teachers, aliases: { "900": "901" } });
const coursesIn = (text: string) => m.match(text).filter((l) => l.kind === "course").map((l) => l.target);
const teachersIn = (text: string) => m.match(text).filter((l) => l.kind === "teacher").map((l) => l.target);

describe("tokens", () => {
  it("folds case, punctuation and Cyrillic, and splits letters from digits", () => {
    expect(tokens("MATH-111, calc2!")).toEqual(["math", "111", "calc", "2"]);
    expect(tokens("Холматов")).toEqual(["kholmatov"]);
  });
});

describe("course codes", () => {
  it("finds a code however it is written", () => {
    for (const text of ["MATH111 final?", "math 111 final?", "Math-111 final?", "who teaches MaTh111", "math111dan savollar"]) expect(coursesIn(text)).toEqual(["MATH111"]);
  });
  it("ignores codes the LMS does not have (SAT scores, rooms)", () => {
    expect(coursesIn("I got MATH800 on the SAT, room 305")).toEqual([]);
    expect(coursesIn("MATH 1111")).toEqual([]);
  });
});

describe("course names", () => {
  it("matches whole names, never the next number", () => {
    expect(coursesIn("Calculus 1 final was hard")).toEqual(["MATH111"]);
    expect(coursesIn("Calculus 2 final was hard")).toEqual(["MATH112"]);
    expect(coursesIn("calculus 12 is not a course")).toEqual([]);
    expect(coursesIn("calculus is fun")).toEqual([]);
    expect(coursesIn("Calculus 1 and Calculus 2")).toEqual(["MATH111", "MATH112"]);
  });
  it("knows common short names", () => {
    expect(coursesIn("calc2 quiz today?")).toEqual(["MATH112"]);
    expect(coursesIn("Calc 1 resit")).toEqual(["MATH111"]);
    expect(coursesIn("physics 1 lab")).toEqual(["PHYS101"]);
    expect(coursesIn("Physics I lab")).toEqual(["PHYS101"]);
    expect(coursesIn("DLD final exam paper")).toEqual(["ECE201"]);
    expect(coursesIn("acs2 bilan")).toEqual(["ENG102"]);
    expect(coursesIn("OOP mid past questions")).toEqual(["CS102"]);
    expect(coursesIn("comp prog 2 labs")).toEqual(["CS102"]);
    expect(coursesIn("intro to microeconomics notes")).toEqual(["ECON101"]);
    expect(coursesIn("microeconomics notes")).toEqual([]);
    expect(coursesIn("microeconomics 2 notes")).toEqual(["ECON201"]);
  });
  it("allows Uzbek and Russian endings on the last word", () => {
    expect(coursesIn("linear algebradan fail bo'lsa")).toEqual(["MATH201"]);
    expect(coursesIn("dld dan ertaga")).toEqual(["ECE201"]);
    expect(coursesIn("econometricsni kim o'tadi")).toEqual(["MATH300"]);
  });
  it("skips a short name that starts another course's name", () => {
    expect(coursesIn("Struggling with calculus?")).toEqual([]);
    expect(coursesIn("data science students")).toEqual([]);
    expect(coursesIn("introduction to data science syllabus")).toEqual(["CS30"]);
    expect(coursesIn("data science fundamentals syllabus")).toEqual(["CS40"]);
  });
  it("skips a course named like a study programme", () => {
    const withProgrammes = compileMatcher({ courses: [...courses, { code: "CS2011", name: "Software Engineering" }], teachers: [], programs: ["BSc in Software Engineering"] });
    const found = (text: string) => withProgrammes.match(text).map((l) => l.target);
    expect(found("software engineering students, any internships?")).toEqual([]);
    expect(found("CS2011 project groups")).toEqual(["CS2011"]);
    expect(withProgrammes.fingerprint).not.toBe(compileMatcher({ courses: [...courses, { code: "CS2011", name: "Software Engineering" }], teachers: [] }).fingerprint);
  });
  it("skips loose words, everyday acronyms and shared names", () => {
    expect(coursesIn("oops, wrong chat")).toEqual([]);
    expect(coursesIn("they posted the names of failed students")).toEqual([]);
    expect(coursesIn("statistics show that nobody reads")).toEqual([]);
    expect(coursesIn("General Biology lab")).toEqual([]);
    expect(courseVariants("Nanotechnology and Advanced Materials Engineering").map((v) => v.join(" "))).not.toContain("name");
  });
});

describe("professors", () => {
  it("matches surname and given name in either order, with endings", () => {
    expect(teachersIn("prof Kayumov Abduaziz email?")).toEqual(["167"]);
    expect(teachersIn("Abduaziz Kayumov's class")).toEqual(["167"]);
    expect(teachersIn("Bakhodir Kayumovni xonasi qaysi")).toEqual(["66"]);
    expect(teachersIn("Prof. Kayumov Abduazizning emaili kerak")).toEqual(["167"]);
  });
  it("meets the usual spellings and Cyrillic", () => {
    expect(teachersIn("Kholmatov Siyavushkhon office?")).toEqual(["214"]);
    expect(teachersIn("Siyavush Xolmatov")).toEqual(["214"]);
    expect(teachersIn("Холматов Сиявушхон")).toEqual(["214"]);
    expect(teachersIn("Durova Yuliya qanday o'tadi")).toEqual(["13"]);
    expect(teachersIn("web uchun Kayumov Abdulaziz yoki")).toEqual(["167"]);
  });
  it("takes a surname alone only when it is unique and a teaching word is near", () => {
    expect(teachersIn("prof Pinto or prof Farid?")).toEqual(["36"]);
    expect(teachersIn("Pinto's lecture today")).toEqual(["36"]);
    expect(teachersIn("pinto beans for dinner")).toEqual([]);
    // Two Kayumovs: the surname alone is ambiguous.
    expect(teachersIn("prof Kayumov is great")).toEqual([]);
  });
  it("tells namesakes apart by the given name and skips true ambiguity", () => {
    expect(teachersIn("great thanks to prof Lee Sanghyuk")).toEqual(["8"]);
    expect(teachersIn("Jung Jin Lee's book")).toEqual(["136"]);
    expect(teachersIn("prof Lee is strict")).toEqual([]);
    expect(teachersIn("Aziz Rakhimov's lab")).toEqual([]);
  });
  it("maps merged teachers to the kept id and uses admin display names", () => {
    expect(teachersIn("Anna Tomskova thank you")).toEqual(["901"]);
    expect(teachersIn("Prof Rasim Mutlu's office hours")).toEqual(["77"]);
  });
});

describe("matcher fingerprint", () => {
  it("changes with the courses and teachers, not with the order they come in", () => {
    const again = compileMatcher({ courses: [...courses].reverse(), teachers: [...teachers].reverse(), aliases: { "900": "901" } });
    expect(again.fingerprint).toBe(m.fingerprint);
    expect(compileMatcher({ courses: courses.slice(1), teachers, aliases: { "900": "901" } }).fingerprint).not.toBe(m.fingerprint);
    expect(compileMatcher({ courses, teachers }).fingerprint).not.toBe(m.fingerprint);
  });
  it("keys hidden links by post, kind and target", () => {
    expect(linkKey(5, "teacher", "36")).toBe("5|teacher|36");
  });
});
