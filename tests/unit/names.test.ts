import { describe, expect, it } from "vitest";
import { shortName } from "@/lib/catalog/names";

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
