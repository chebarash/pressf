import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { lmsDepartments, lmsPrograms } from "@/lib/db/schema";
import { schools } from "@/server/views";
import { resetDb } from "../fixtures/db";

beforeEach(async () => {
  await resetDb();
  await db().delete(lmsPrograms);
  await db().delete(lmsDepartments);
});

describe("schools and programs", () => {
  it("groups programs under the university's schools, not under unnamed top departments", async () => {
    await db().insert(lmsDepartments).values([
      { id: "1", parentId: null, name: null, shortName: null },
      { id: "2", parentId: null, name: "", shortName: null },
      { id: "10", parentId: "1", name: "Department of Software Engineering" },
      { id: "11", parentId: "2", name: "Computer Science" },
      { id: "12", parentId: "2", name: "Mathematics" },
      { id: "13", parentId: "1", name: "Robotics lab" },
    ]);
    await db().insert(lmsPrograms).values([
      { id: "p1", name: "Software Engineering", departmentId: "10" },
      { id: "p2", name: "Cyber Security", departmentId: "11" },
      { id: "p3", name: "Applied Mathematics", departmentId: "12" },
      { id: "p4", name: "Mechatronics", departmentId: "13" },
    ]);
    const v = await schools();
    const names = v.schools.map((s) => s.name);
    expect(names).toEqual(["School of Computing", "School of Humanities, Natural and Social Sciences", "Other programs"]);
    expect(v.schools.find((s) => s.name === "School of Computing")?.programs.map((p) => p.name)).toEqual(["Cyber Security", "Software Engineering"]);
    expect(new Set(v.schools.map((s) => s.id)).size).toBe(v.schools.length);
  });
});
