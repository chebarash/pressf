import { describe, expect, it } from "vitest";
import { parentOf } from "@/platform/TelegramBridge";

describe("Back without history goes up to the section", () => {
  it.each([
    ["/c/CS412", "/courses"], ["/c/CS412/files", "/courses"], ["/f/3577", "/courses"],
    ["/p/141", "/professors"], ["/progress/906", "/progress"], ["/me/ratings", "/me"],
    ["/timetable", "/"], ["/a/123", "/"], ["/", "/"],
  ])("%s → %s", (from, to) => expect(parentOf(from)).toBe(to));
});
