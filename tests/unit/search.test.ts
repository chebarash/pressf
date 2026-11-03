import { describe, expect, it } from "vitest";
import { compact, createIndex, editDistance, fold, nameSimilarity, phonetic, TIER, words } from "@/core/search";

const COURSES = [
  { code: "MATH111", name: "Calculus 1" },
  { code: "MATH112", name: "Calculus 2" },
  { code: "MATH011", name: "Precalculus" },
  { code: "MATH211", name: "Linear Algebra" },
  { code: "MATH 311", name: "Mathematical Statistics" },
  { code: "PHYS101", name: "Physics 1" },
  { code: "PHYS102", name: "Physics 2" },
  { code: "CS101", name: "Introduction to Programming" },
  { code: "CS201", name: "Data Structures and Algorithms" },
  { code: "ENG101", name: "Academic English 1" },
  { code: "ECON101", name: "Principles of Microeconomics" },
  { code: "ECON102", name: "Principles of Macroeconomics" },
  { code: "BUS210", name: "Business Statistics" },
  { code: "UZB101", name: "O‘zbek tili" },
  { code: "HIST100", name: "History of Uzbekistan" },
  { code: "ARCH201", name: "Architecture Studio" },
];
const courses = createIndex(COURSES.map((c) => ({ item: c.code, text: c.name, code: c.code })));
const codes = (q: string, n = 5) => courses.search(q, n).map((h) => h.item);

const PEOPLE = [
  { id: "T1", name: "Gonçalo Pinto" },
  { id: "T2", name: "Dilnoza Xasanova" },
  { id: "T3", name: "Yulia Ivanova" },
  { id: "T4", name: "Javlon Karimov" },
  { id: "T5", name: "Ivan Petrov" },
  { id: "T6", name: "Bekzod Qodirov" },
  { id: "T7", name: "Anna Pinter" },
  { id: "T8", name: "Søren Kjær" },
  { id: "T9", name: "Sherzod Jo‘rayev" },
];
const people = createIndex(PEOPLE.map((p) => ({ item: p.id, text: p.name })), { names: true });
const who = (q: string, n = 3) => people.search(q, n).map((h) => h.item);

const FILES = [
  { id: "F1", title: "Midterm review slides", code: "MATH111", course: "Calculus 1" },
  { id: "F2", title: "Final exam 2024", code: "MATH111", course: "Calculus 1" },
  { id: "F3", title: "Lab 3 report template", code: "PHYS101", course: "Physics 1" },
  { id: "F4", title: "Midterm solutions", code: "PHYS101", course: "Physics 1" },
  { id: "F5", title: "Lecture 5 — Integrals", code: "MATH111", course: "Calculus 1" },
  { id: "F6", title: "Syllabus", code: "CS101", course: "Introduction to Programming" },
];
const files = createIndex(FILES.map((f) => ({ item: f.id, text: f.title, extra: `${f.code} ${f.course}` })));
const found = (q: string, n = 6) => files.search(q, n).map((h) => h.item);

describe("folding", () => {
  it("drops accents and odd letters", () => {
    expect(fold("Gonçalo")).toBe("goncalo");
    expect(fold("Søren Kjær")).toBe("soren kjaer");
    expect(fold("Łukasz Straße")).toBe("lukasz strasse");
    expect(fold("  José   María ")).toBe("jose maria");
  });

  it("transliterates Cyrillic and removes Uzbek apostrophes", () => {
    expect(fold("Гонсало Пинто")).toBe("gonsalo pinto");
    expect(fold("Юлия Иванова")).toBe("yuliya ivanova");
    expect(fold("Хасанова")).toBe("khasanova");
    expect(fold("O‘zbek tili")).toBe("ozbek tili");
    expect(fold("G'ulomov")).toBe("gulomov");
    expect(fold("Ўзбек тили")).toBe("ozbek tili");
  });

  it("turns punctuation into spaces and joins codes", () => {
    expect(fold("Lecture 5 — Integrals!")).toBe("lecture 5 integrals");
    expect(compact("MATH 111")).toBe("math111");
    expect(compact("math-111")).toBe("math111");
    expect(words("MATH111")).toEqual(["math111", "math", "111"]);
  });

  it("folds name spellings phonetically", () => {
    expect(phonetic("khasanova")).toBe(phonetic("xasanova"));
    expect(phonetic("hasanova")).toBe(phonetic("xasanova"));
    expect(phonetic("yuliya")).toBe(phonetic("iuliia"));
    expect(phonetic("yulia")).toBe(phonetic("iulia"));
    expect(phonetic("qodirov")).toBe(phonetic("kodirov"));
    expect(phonetic("zhavlon")).toBe(phonetic("javlon"));
  });
});

describe("edit distance", () => {
  it("counts swaps as one edit", () => {
    expect(editDistance("calculas", "calculus")).toBe(1);
    expect(editDistance("pyhsics", "physics")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
    expect(editDistance("a", "abcdef", 2)).toBe(3);
  });
});

describe("course ranking", () => {
  it("puts the exact code first, in any spelling", () => {
    expect(codes("MATH111")[0]).toBe("MATH111");
    expect(codes("math111")[0]).toBe("MATH111");
    expect(codes("MATH 111")[0]).toBe("MATH111");
    expect(codes("math-111")[0]).toBe("MATH111");
    expect(codes("math 311")[0]).toBe("MATH 311");
    expect(codes("math311")[0]).toBe("MATH 311");
    expect(courses.search("math111", 1)[0].tier).toBe(TIER.exact);
  });

  it("ranks code prefixes by closeness", () => {
    expect(codes("math11", 3)).toEqual(["MATH111", "MATH112"]);
    expect(codes("phys")).toEqual(["PHYS101", "PHYS102"]);
    expect(codes("cs1")[0]).toBe("CS101");
    expect(courses.search("math1", 5).every((h) => h.tier >= TIER.prefix)).toBe(true);
  });

  it("exact name > name prefix > word prefix > substring", () => {
    expect(codes("calculus 1")[0]).toBe("MATH111");
    expect(courses.search("calculus 1", 1)[0].tier).toBe(TIER.exact);
    expect(codes("calc")).toEqual(["MATH111", "MATH112", "MATH011"]);
    expect(courses.search("calc", 3).map((h) => h.tier)).toEqual([TIER.prefix, TIER.prefix, TIER.substring]);
    expect(codes("statistics")).toEqual(["BUS210", "MATH 311"]);
    expect(codes("stat")[0]).toBe("BUS210");
    expect(codes("algebra")).toEqual(["MATH211"]);
  });

  it("needs every word", () => {
    expect(codes("data algo")).toEqual(["CS201"]);
    expect(codes("principles macro")).toEqual(["ECON102"]);
    expect(codes("calculus physics")).toEqual([]);
  });

  it("mixes code and name words", () => {
    expect(codes("math calculus")).toEqual(["MATH111", "MATH112", "MATH011"]);
    expect(codes("cs intro")).toEqual(["CS101"]);
  });

  it("forgives typos", () => {
    expect(codes("calculas")[0]).toBe("MATH111");
    expect(codes("phisics")[0]).toBe("PHYS101");
    expect(codes("pyhsics")[0]).toBe("PHYS101");
    expect(codes("algrebra")).toEqual(["MATH211"]);
    expect(codes("akademik english")[0]).toBe("ENG101");
    expect(codes("microeconomcis")[0]).toBe("ECON101");
    expect(courses.search("calculas", 1)[0].tier).toBe(TIER.typo);
  });

  it("does not drag in typo matches when the word exists", () => {
    expect(codes("math")).toEqual(expect.arrayContaining(["MATH111", "MATH112"]));
    expect(codes("math", 10)).not.toContain("ARCH201");
    expect(codes("data")).toEqual(["CS201"]);
  });

  it("keeps short words strict and finds nothing for nonsense", () => {
    expect(codes("qzx")).toEqual([]);
    expect(codes("quantum")).toEqual([]);
    expect(codes("")).toEqual([]);
    expect(codes("   ")).toEqual([]);
  });

  it("reads Uzbek and Cyrillic course names", () => {
    expect(codes("ozbek")).toEqual(["UZB101"]);
    expect(codes("o'zbek tili")[0]).toBe("UZB101");
    expect(codes("Ўзбек")[0]).toBe("UZB101");
    expect(codes("uzbekistan")).toEqual(["HIST100"]);
  });

  it("respects the limit", () => {
    expect(codes("math", 2)).toHaveLength(2);
    expect(courses.search("math", 0)).toEqual([]);
  });
});

describe("professor ranking", () => {
  it("finds by given name, surname and both orders", () => {
    expect(who("pinto")[0]).toBe("T1");
    expect(who("goncalo")[0]).toBe("T1");
    expect(who("goncalo pinto")).toEqual(["T1"]);
    expect(who("pinto goncalo")).toEqual(["T1"]);
    expect(people.search("pinto goncalo", 1)[0].tier).toBe(TIER.exact);
    expect(people.search("Gonçalo Pinto", 1)[0].tier).toBe(TIER.exact);
  });

  it("folds accents both ways", () => {
    expect(who("Gonçalo")[0]).toBe("T1");
    expect(who("soren")[0]).toBe("T8");
    expect(who("kjaer")[0]).toBe("T8");
  });

  it("matches as you type", () => {
    expect(who("pin").sort()).toEqual(["T1", "T7"]);
    expect(who("go")[0]).toBe("T1");
    expect(who("gon pi")).toEqual(["T1"]);
  });

  it("reads Cyrillic and other transliterations", () => {
    expect(who("Гонсало")[0]).toBe("T1");
    expect(who("Пинто")[0]).toBe("T1");
    expect(who("Хасанова")[0]).toBe("T2");
    expect(who("khasanova")[0]).toBe("T2");
    expect(who("hasanova")[0]).toBe("T2");
    expect(who("Юлия")[0]).toBe("T3");
    expect(who("iuliia ivanova")[0]).toBe("T3");
    expect(who("Иван Петров")[0]).toBe("T5");
    expect(who("kodirov")[0]).toBe("T6");
    expect(who("Қодиров")[0]).toBe("T6");
    expect(who("jorayev")[0]).toBe("T9");
    expect(who("Жавлон")[0]).toBe("T4");
  });

  it("forgives typos in names", () => {
    expect(who("gonsalo")[0]).toBe("T1");
    expect(who("karimvo")[0]).toBe("T4");
    expect(who("petorv")[0]).toBe("T5");
  });

  it("ranks a whole surname above a longer one that starts the same", () => {
    expect(who("pinto")).toEqual(["T1"]);
    expect(who("pinter")).toEqual(["T7"]);
    expect(people.search("pinto", 1)[0].tier).toBeGreaterThanOrEqual(TIER.prefix);
  });
});

describe("file ranking", () => {
  it("prefers title matches over course matches", () => {
    expect(found("midterm").sort()).toEqual(["F1", "F4"]);
    expect(found("calculus midterm")).toEqual(["F1"]);
    expect(found("physics midterm")).toEqual(["F4"]);
    expect(found("math111 final")).toEqual(["F2"]);
    expect(found("MATH 111 final")).toEqual(["F2"]);
  });

  it("finds a course's files by its code", () => {
    expect(found("phys101")).toEqual(expect.arrayContaining(["F3", "F4"]));
    expect(found("syllabus")[0]).toBe("F6");
  });

  it("forgives typos and punctuation", () => {
    expect(found("midtrem").sort()).toEqual(["F1", "F4"]);
    expect(found("integrls")).toEqual(["F5"]);
    expect(found("lecture 5 integrals")).toEqual(["F5"]);
  });
});

describe("name similarity", () => {
  it("scores the same person high in any order and spelling", () => {
    expect(nameSimilarity("Gonçalo Pinto", "Pinto Goncalo")).toBe(1);
    expect(nameSimilarity("Dilnoza Khasanova", "Xasanova Dilnoza")).toBe(1);
    expect(nameSimilarity("Гонсало Пинто", "Gonçalo Pinto")).toBeGreaterThan(0.8);
    expect(nameSimilarity("G. Pinto", "Gonçalo Pinto")).toBeGreaterThan(0.7);
  });

  it("scores different people low", () => {
    expect(nameSimilarity("Ivan Petrov", "Gonçalo Pinto")).toBeLessThan(0.5);
    expect(nameSimilarity("", "Gonçalo Pinto")).toBe(0);
  });
});

describe("speed", () => {
  it("searches 30 000 files in well under 50 ms", () => {
    const vocab = ["lecture", "midterm", "final", "exam", "review", "slides", "lab", "report", "notes", "solutions", "homework", "quiz", "chapter", "integrals", "derivatives", "matrices", "vectors", "probability", "statistics", "thermodynamics"];
    const big = createIndex(
      Array.from({ length: 30_000 }, (_, i) => ({
        item: i,
        text: `${vocab[i % vocab.length]} ${vocab[(i * 7) % vocab.length]} ${i % 40} ${vocab[(i * 13) % vocab.length]}${i % 97}`,
        extra: `COURSE${i % 300} Course name ${i % 300}`,
      })),
    );
    big.search("warm", 4);
    const queries = ["midterm", "midtrem review", "course12 final", "thermodinamics", "lab 3", "integ", "zzzz"];
    const start = performance.now();
    for (const q of queries) big.search(q, 4);
    const each = (performance.now() - start) / queries.length;
    expect(each).toBeLessThan(50);
  });
});
