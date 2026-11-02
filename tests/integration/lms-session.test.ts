import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lms = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock("@/lib/lms/client", async (original) => ({
  ...(await original<typeof import("@/lib/lms/client")>()),
  login: lms.login,
}));

import { eq } from "drizzle-orm";
import { LmsError } from "@/lib/lms/client";
import { db } from "@/lib/db";
import { lmsAccounts, users } from "@/lib/db/schema";
import { open } from "@/lib/lms/crypto";
import { markInvalid, saveAccount, sessionFor } from "@/lib/lms/store";
import { resetDb } from "../fixtures/db";

/** A JWT whose `exp` claim is `secondsFromNow` ahead, with a throwaway signature. */
function jwt(secondsFromNow: number) {
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })).toString("base64url");
  return `e30.${body}.sig`;
}

let userId: string;

beforeEach(async () => {
  await resetDb();
  const [row] = await db().insert(users).values({ email: "s@newuu.uz" }).returning();
  userId = row.id;
  lms.login.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("lms/store", () => {
  it("seals the password and caches the token on save", async () => {
    lms.login.mockResolvedValue({ token: jwt(72 * 3600) });
    await saveAccount(userId, "s@newuu.uz", "pw-1");
    const [row] = await db().select().from(lmsAccounts).where(eq(lmsAccounts.userId, userId));
    expect(row.sealedPassword).not.toContain("pw-1");
    expect(open(row.sealedPassword)).toBe("pw-1");
    expect(row.status).toBe("active");
    expect(row.token).toContain(".");
  });

  it("reuses a fresh token without logging in again", async () => {
    lms.login.mockResolvedValue({ token: jwt(72 * 3600) });
    await saveAccount(userId, "s@newuu.uz", "pw-1");
    lms.login.mockClear();
    const s = await sessionFor(userId);
    expect(s?.token).toBeTruthy();
    expect(lms.login).not.toHaveBeenCalled();
  });

  it("re-logs in from the sealed password when the token is near expiry", async () => {
    lms.login.mockResolvedValueOnce({ token: jwt(60) }); // expires within the refresh margin
    await saveAccount(userId, "s@newuu.uz", "pw-1");
    lms.login.mockResolvedValueOnce({ token: jwt(72 * 3600) });
    const s = await sessionFor(userId);
    expect(s?.token).toBe((await lms.login.mock.results[1].value).token);
    expect(lms.login).toHaveBeenLastCalledWith("s@newuu.uz", "pw-1");
  });

  it("marks the login invalid when the password is rejected and stops retrying", async () => {
    lms.login.mockResolvedValueOnce({ token: jwt(60) });
    await saveAccount(userId, "s@newuu.uz", "pw-1");
    lms.login.mockRejectedValueOnce(new LmsError("bad", 401));
    expect(await sessionFor(userId)).toBeNull();
    const [row] = await db().select().from(lmsAccounts).where(eq(lmsAccounts.userId, userId));
    expect(row.status).toBe("invalid");
    lms.login.mockClear();
    expect(await sessionFor(userId)).toBeNull();
    expect(lms.login).not.toHaveBeenCalled();
  });

  it("does not invalidate on a transient (non-401) error", async () => {
    lms.login.mockResolvedValueOnce({ token: jwt(60) });
    await saveAccount(userId, "s@newuu.uz", "pw-1");
    lms.login.mockRejectedValueOnce(new LmsError("down", 503));
    expect(await sessionFor(userId)).toBeNull();
    const [row] = await db().select().from(lmsAccounts).where(eq(lmsAccounts.userId, userId));
    expect(row.status).toBe("active");
  });

  it("returns null after markInvalid", async () => {
    lms.login.mockResolvedValue({ token: jwt(72 * 3600) });
    await saveAccount(userId, "s@newuu.uz", "pw-1");
    await markInvalid(userId);
    expect(await sessionFor(userId)).toBeNull();
  });

  it("rejects a bad password at save time", async () => {
    lms.login.mockRejectedValue(new LmsError("no token", 401));
    await expect(saveAccount(userId, "s@newuu.uz", "wrong")).rejects.toBeInstanceOf(LmsError);
    const rows = await db().select().from(lmsAccounts).where(eq(lmsAccounts.userId, userId));
    expect(rows).toHaveLength(0);
  });
});
