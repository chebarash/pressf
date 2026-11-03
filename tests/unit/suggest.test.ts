import { describe, expect, it } from "vitest";
import { closest, distance } from "@/core/suggest";

describe("did you mean", () => {
  it("measures edits", () => {
    expect(distance("calculas", "calculus")).toBe(1);
    expect(distance("abc", "abc")).toBe(0);
    expect(distance("kitten", "sitting")).toBe(3);
    expect(distance("a", "abcdef", 2)).toBe(3);
  });

  it("finds the course name closest to a typo", () => {
    const names = ["Calculus 1", "Calculus 2", "Physics 1", "Academic English"];
    expect(closest("calculas 1", names)).toBe("Calculus 1");
    expect(closest("calculas", names)).toBe("Calculus 1");
    expect(closest("phisics 1", names)).toBe("Physics 1");
    expect(closest("Akademik English", names)).toBe("Academic English");
  });

  it("stays quiet when nothing is close", () => {
    expect(closest("quantum", ["Calculus 1", "Physics 1"])).toBeNull();
    expect(closest("ab", ["ab c"])).toBeNull();
    expect(closest("", ["Calculus 1"])).toBeNull();
  });
});
