import { describe, expect, it } from "vitest";
import { courseCertainty, teacherCertainty } from "@/lib/mention-match";

const teacher = { id: "o-ismailov", display_name: "Otabek Ismailov" };
const course = { code: "MATH111", subject: "Calculus 1", aliases: ["Calc 1"] };

describe("teacherCertainty", () => {
  it("is exact when the surname is there", () => expect(teacherCertainty("Ismailov is great", teacher)).toBe("exact"));
  it("allows other spellings", () => expect(teacherCertainty("Ismoilov domla", teacher)).toBe("exact"));
  it("reads Cyrillic", () => expect(teacherCertainty("Исмаилов отличный", teacher)).toBe("exact"));
  it("doubts a post that shares only a given name", () => expect(teacherCertainty("Otabek Abdumalikov karta topib oldim", teacher)).toBe("possible"));
  it("needs every part without an id to read", () => {
    expect(teacherCertainty("Otabek Ismailov", { id: "1234", display_name: "Otabek Ismailov" })).toBe("exact");
    expect(teacherCertainty("Otabek", { id: "1234", display_name: "Otabek Ismailov" })).toBe("possible");
  });
});

describe("courseCertainty", () => {
  it("finds the code in any spelling", () => {
    expect(courseCertainty("math 111 midterm?", course)).toBe("exact");
    expect(courseCertainty("MATH111", course)).toBe("exact");
  });
  it("finds the title and aliases", () => expect(courseCertainty("who teaches calc 1?", course)).toBe("exact"));
  it("does not take a longer number for the code", () => expect(courseCertainty("math1111", course)).toBe("possible"));
  it("doubts anything else", () => expect(courseCertainty("calculus is hard", course)).toBe("possible"));
});
