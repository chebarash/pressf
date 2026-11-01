import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.hoisted(() => vi.fn(async (key: string) => key));
vi.mock("@/lib/storage", () => ({ putObject: put }));

import { syncPhotos } from "@/lib/catalog/photos";
import { db } from "@/lib/db";
import { faces } from "@/lib/db/schema";
import { teacher } from "../fixtures/catalog";
import { resetDb } from "../fixtures/db";

const image = (file: string) => `https://api.newuu.uz/employee/image/${Buffer.from(`${file}|1`).toString("base64")}/sig`;
const page = (file: string) => `<img src="${image(file)}" alt="PINTO GONCALO">`;
const person = teacher("g-pinto", { name: "PINTO GONCALO" });

function stub(file: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    url.includes("/employee/image/") ? new Response("jpg", { headers: { "content-type": "image/jpeg" } }) : new Response(page(file))));
}

beforeEach(async () => { await resetDb(); put.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe("syncPhotos", () => {
  it("copies a photo into storage", async () => {
    stub("photos/a.jpg");
    await syncPhotos([person]);
    expect(put).toHaveBeenCalledOnce();
    expect((await db().select().from(faces))[0]).toMatchObject({ teacherId: "g-pinto", drawn: false, source: "photos/a.jpg" });
  });
  it("skips an unchanged photo and refreshes a new one", async () => {
    stub("photos/a.jpg");
    await syncPhotos([person]);
    await syncPhotos([person]);
    expect(put).toHaveBeenCalledOnce();
    stub("photos/b.jpg");
    await syncPhotos([person]);
    expect(put).toHaveBeenCalledTimes(2);
  });
  it("never replaces a drawn face", async () => {
    await db().insert(faces).values({ teacherId: "g-pinto", storageKey: "drawn.png" });
    stub("photos/a.jpg");
    await syncPhotos([person]);
    expect(put).not.toHaveBeenCalled();
  });
});
