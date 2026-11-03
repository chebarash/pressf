import { describe, expect, it } from "vitest";
import { GET } from "@/app/og/[...slug]/route";
import { anonymousMetadata, ogImagePath, signAnonymous, termName } from "@/server/og";

const call = (path: string, ...slug: string[]) => GET(new Request(`https://pressf.test${path}`), { params: Promise.resolve({ slug }) });

describe("og routes", () => {
  it.each([
    ["/og/app", ["app"]],
    ["/og/telegram", ["telegram"]],
    ["/og/rate?term=Fall%202026", ["rate"]],
    ["/og/course/NOPE101?v=x", ["course", "NOPE101"]],
    ["/og/course-new/NOPE101", ["course-new", "NOPE101"]],
    ["/og/professor/0", ["professor", "0"]],
    ["/og/file/0", ["file", "0"]],
    ["/og/next/NOPE101", ["next", "NOPE101"]],
    ["/og/anonymous/1?c=Calculus%201&t=hi&r=2&s=bad", ["anonymous", "1"]],
  ])("%s returns a PNG", async (path, slug) => {
    const res = await call(path, ...slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
  });

  it("caches versioned images forever", async () => {
    const res = await call("/og/app?v=abc", "app");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("signs anonymous post images", () => {
    const d = { courseName: "Calculus 1", text: "Same exam for everyone?", replies: 14 };
    const m = anonymousMetadata({ id: "42", ...d });
    const img = (m.openGraph?.images as Array<{ url: string }>)[0].url;
    expect(img).toContain(`s=${signAnonymous(d)}`);
    expect(img).not.toMatch(/author|user/i);
  });

  it("versions image paths by data", () => {
    expect(ogImagePath("course", "MATH111", { a: 1 })).not.toBe(ogImagePath("course", "MATH111", { a: 2 }));
    expect(termName(new Date("2026-10-01T00:00:00Z"))).toMatch(/^(Fall|Spring) \d{4}$/);
  });
});
