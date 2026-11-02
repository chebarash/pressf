import { afterEach, describe, expect, it, vi } from "vitest";
import { LmsError, login, subject } from "@/lib/lms/client";

const session = { token: "t0ken" };

function mockFetch(status: number, body: unknown, contentType = "application/json") {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": contentType },
    }) as unknown as Response
  );
}

describe("lms/client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the token from a successful login", async () => {
    mockFetch(200, { token: "abc" });
    expect(await login("a@newuu.uz", "pw")).toEqual({ token: "abc" });
  });

  it("treats a login without a token as an auth failure", async () => {
    mockFetch(200, { error: ["bad"] });
    await expect(login("a@newuu.uz", "pw")).rejects.toMatchObject({ status: 401 });
  });

  it("marks a 401 as expired so callers can re-login", async () => {
    mockFetch(401, { error: ["unauthorized"] });
    const err = await subject(session, 906).catch((e) => e);
    expect(err).toBeInstanceOf(LmsError);
    expect(err.expired).toBe(true);
  });

  it("unwraps the single-element array from get-by-id", async () => {
    mockFetch(200, [{ id: "906", name: "Deep Learning", code: "CS412" }]);
    expect(await subject(session, 906)).toMatchObject({ code: "CS412" });
  });

  it("returns null when get-by-id has no row", async () => {
    mockFetch(200, []);
    expect(await subject(session, 1)).toBeNull();
  });
});
