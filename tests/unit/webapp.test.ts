import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "@/lib/telegram/webapp";

function sign(fields: Record<string, string>, token = "tg-token") {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = () => String(Math.floor(Date.now() / 1000));
const user = JSON.stringify({ id: 42, first_name: "A" });

describe("verifyInitData", () => {
  it("accepts data signed for this bot", () => expect(verifyInitData(sign({ auth_date: now(), user }))).toBe("42"));
  it("rejects another bot's signature", () => expect(verifyInitData(sign({ auth_date: now(), user }, "other"))).toBeNull());
  it("rejects tampering", () => {
    const signed = sign({ auth_date: now(), user });
    expect(verifyInitData(signed.replace("42", "43"))).toBeNull();
  });
  it("rejects old data", () => {
    expect(verifyInitData(sign({ auth_date: String(Number(now()) - 7200), user }), 3600)).toBeNull();
  });
  it("rejects junk", () => {
    expect(verifyInitData("")).toBeNull();
    expect(verifyInitData("hash=zz")).toBeNull();
  });
});
