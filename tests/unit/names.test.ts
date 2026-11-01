import { describe, expect, it } from "vitest";
import { nameKey, shortName } from "@/lib/catalog/names";
import { parsePhotos, photoSource } from "@/lib/catalog/photos";

const short = (id: string, display_name: string) => shortName({ id, display_name });

describe("shortName", () => {
  it("keeps two word names", () => expect(short("g-pinto", "Gonçalo Pinto")).toBe("Gonçalo Pinto"));
  it("drops a father's name", () => {
    expect(short("a-kayumov", "Abduaziz Qayumov Ismat")).toBe("Abduaziz Qayumov");
    expect(short("ar-abdukarimov", "Abdukarimov Abduhafiz Ravshanjon")).toBe("Abdukarimov Abduhafiz");
  });
  it("finds the surname from the email id", () => {
    expect(short("a-herrmann", "Anton Wolfgang Herrmann")).toBe("Anton Herrmann");
    expect(short("k-abbaszadeh", "Abbaszade Askeshahri Keyvan Naser")).toBe("Abbaszade Keyvan");
  });
  it("uses the first two words without an email id", () => {
    expect(short("250595", "Azimov Asror Abrorjon")).toBe("Azimov Asror");
  });
});

describe("photos", () => {
  it("matches names in any order and spelling of marks", () => {
    expect(nameKey("Gonçalo PINTO ")).toBe(nameKey("pinto goncalo"));
    expect(nameKey("Turg'unov Ali")).toBe(nameKey("TURGUNOV ALI"));
  });
  it("reads photos from a page over https", () => {
    const html = '<img class="a" src="http://api.newuu.uz/employee/image/abc/def" alt="Topol Heiko ">';
    expect(parsePhotos(html).get(nameKey("Heiko Topol"))).toBe("https://api.newuu.uz/employee/image/abc/def");
  });
  it("sees the same file behind a new signature", () => {
    const link = (expires: number) => `https://x/image/${Buffer.from(`photos/a.jpg|${expires}`).toString("base64")}/sig`;
    expect(photoSource(link(1))).toBe("photos/a.jpg");
    expect(photoSource(link(2))).toBe(photoSource(link(1)));
  });
});
