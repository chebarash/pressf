import { describe, expect, it } from "vitest";
import { parentOf, signInNext } from "@/platform/TelegramBridge";

describe("Back without history goes up to the section", () => {
  it.each([
    ["/c/CS412", "/courses"], ["/c/CS412/files", "/courses"], ["/f/3577", "/courses"],
    ["/p/141", "/professors"], ["/progress/906", "/progress"], ["/me/ratings", "/me"],
    ["/timetable", "/"], ["/a/123", "/"], ["/", "/"],
  ])("%s → %s", (from, to) => expect(parentOf(from)).toBe(to));
});

describe("A silent Telegram sign-in leaves /sign-in for where it was headed", () => {
  it.each([
    ["?next=%2Fprogress", "/progress"], ["?next=/timetable?view=month", "/timetable?view=month"],
    ["", "/"], ["?next=//evil.example", "/"], ["?next=https://evil.example", "/"],
  ])("%s → %s", (search, to) => expect(signInNext(search)).toBe(to));
});
