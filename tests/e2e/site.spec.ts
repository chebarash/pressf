import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// Home changes once a student has a group, and tests share one student.
test.beforeEach(async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://pressf@127.0.0.1:5544/pressf_test" });
  await pool.query('update users set "group" = null');
  await pool.end();
});

/** The key works once the page is interactive, so it is pressed until the panel opens. */
async function pressF(page: import("@playwright/test").Page) {
  await expect(async () => {
    await page.keyboard.press("f");
    await expect(page.getByRole("dialog")).toHaveCount(1, { timeout: 1000 });
  }).toPass();
}

const noSideScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("home opens with search on the F key", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("respects");
  expect(await noSideScroll(page)).toBe(true);
  test.skip(isMobile, "No keyboard on a phone");
  await pressF(page);
  await page.getByRole("textbox", { name: "Search" }).fill("math111");
  await expect(page.getByRole("button", { name: /Calculus 1/ }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/courses\/MATH111/);
});

test("the F key opens one search panel", async ({ page, isMobile }) => {
  test.skip(isMobile, "No keyboard on a phone");
  await page.goto("/");
  await pressF(page);
});

test("the search button works on every device", async ({ page }) => {
  await page.goto("/");
  await expect(async () => {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1, { timeout: 1000 });
  }).toPass();
  await page.getByRole("textbox", { name: "Search" }).fill("pinto");
  await expect(page.getByRole("button", { name: /Gonçalo Pinto/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the phone tab bar reaches the sections", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Desktop shows the links in the header");
  await page.goto("/");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Files" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(page.getByRole("heading", { name: "Files", level: 1 })).toBeVisible();
  const header = await page.locator("header").boundingBox();
  expect(header!.height).toBeLessThan(90);
  expect(await noSideScroll(page)).toBe(true);
});

test("inside Telegram the page behaves like an app", async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    window.calls = [];
    const log = (name) => (...args) => window.calls.push([name, ...args]);
    window.Telegram = { WebApp: { initData: "", colorScheme: "dark", safeAreaInset: { top: 20, bottom: 30 }, contentSafeAreaInset: { top: 40, bottom: 0 },
      ready: log("ready"), expand: log("expand"), disableVerticalSwipes: log("swipes"), isVersionAtLeast: () => true,
      setHeaderColor: log("header"), setBackgroundColor: log("background"), setBottomBarColor: log("bottom"), onEvent: log("event"),
      openLink: log("openLink"), openTelegramLink: log("openTelegramLink"),
      BackButton: { show: log("backShow"), hide: log("backHide"), onClick: (fn) => { window.goBack = fn; } },
      HapticFeedback: { impactOccurred: log("haptic") } } };` }));
  await page.goto("/courses/MATH111#tgWebAppData=x");
  await expect(page.locator("html.tg")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch theme" })).toBeHidden();
  const calls = () => page.evaluate(() => (window as unknown as { calls: string[][] }).calls.map((c) => c[0]));
  await expect.poll(calls).toEqual(expect.arrayContaining(["ready", "expand", "swipes", "header", "backShow"]));
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tg-top"))).toBe("60px");
  await page.getByRole("link", { name: "Open", exact: true }).first().click();
  await expect.poll(calls).toEqual(expect.arrayContaining(["openLink", "haptic"]));
});

test("course page shows syllabus data, files and mentions", async ({ page }) => {
  await page.goto("/courses/MATH111#files");
  await expect(page.getByRole("heading", { name: "Calculus 1", level: 1 })).toBeVisible();
  for (const name of ["How it is graded", "Workload", "Week by week", "Books", "Where it fits", "Files", "What Anonymous says"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Precalculus" })).toBeVisible();
  await expect(page.getByText("Calculus 1 midterm")).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});

test("promised addresses hold", async ({ page }) => {
  await page.goto("/courses/math111");
  await expect(page).toHaveURL(/\/courses\/MATH111$/);
  await page.goto("/professors/gon%C3%A7alo-pinto");
  await expect(page).toHaveURL(/\/professors\/g-pinto$/);
  await page.goto("/timetable?class=FCS%201");
  await expect(page.getByRole("heading", { name: "Timetable" })).toBeVisible();
  await page.goto("/programs/bsc-cyber-security/curriculum");
  await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cyber Security" }).first()).toBeVisible();
});

test("pages without data explain themselves", async ({ page }) => {
  await page.goto("/courses/PHYS101");
  await expect(page.getByRole("heading", { name: "No syllabus yet" })).toBeVisible();
  await page.goto("/programs/md-doctor-of-medicine/curriculum");
  await expect(page.getByText("Curriculum is only in a PDF")).toBeVisible();
  const missing = await page.goto("/courses/NOPE1");
  expect(missing?.status()).toBe(404);
  await expect(page.getByText("This page pressed F")).toBeVisible();
});

test("a student rates with the number keys and pays respect", async ({ page, isMobile }) => {
  await page.goto("/professors/g-pinto");
  await page.getByRole("button", { name: "Rate this professor" }).click();
  const dialog = page.getByRole("dialog");
  if (isMobile) {
    for (const label of ["Clarity 4", "Engagement 4", "Organization 4", "Expertise 4", "Fair grading 4"]) await dialog.getByRole("button", { name: label }).click();
  } else {
    for (const key of ["4", "3", "4", "5", "4"]) { await page.keyboard.press(key); await page.waitForTimeout(160); }
  }
  await dialog.getByRole("button", { name: "Pay respects" }).click();
  await expect(dialog.getByText("Respects paid")).toBeVisible();
  await dialog.getByRole("button", { name: "Back to profile" }).click();
  await page.getByRole("button", { name: "Pay respect", exact: true }).click();
  await page.goto("/me/ratings");
  await expect(page.getByText("Gonçalo Pinto")).toBeVisible();
});

test("choosing a group builds My semester and the timetable", async ({ page, isMobile }) => {
  await page.goto("/me/group");
  await page.getByLabel("Search group").fill("FCS");
  await page.getByRole("button", { name: "FCS 1" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "My semester" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Calculus 1/ }).first()).toBeVisible();
  await page.goto("/timetable");
  const slot = isMobile ? page.getByRole("button", { name: /Calculus 1/ }) : page.locator(".slot", { hasText: "Calculus 1" });
  if (isMobile) await page.getByRole("button", { name: "Mon", exact: true }).click();
  await slot.first().click();
  await expect(page.getByRole("link", { name: "Open course" })).toBeVisible();
});

test("curriculum selects courses", async ({ page }) => {
  await page.goto("/programs/bsc-cyber-security/curriculum");
  await page.getByRole("button", { name: /Calculus 2/ }).click();
  await expect(page.getByRole("complementary").getByRole("heading", { name: "Calculus 2" })).toBeVisible();
});

test("admin reaches syllabi and faces", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Syllabi" })).toBeVisible();
  await page.goto("/admin/faces");
  await expect(page.getByRole("heading", { name: "Faces" })).toBeVisible();
});

test("calendar and theme work", async ({ page, isMobile }) => {
  await page.goto("/calendar");
  await expect(page.getByText("Midterm exams").first()).toBeVisible();
  await page.getByRole("link", { name: "Spring", exact: true }).click();
  await expect(page).toHaveURL(/term=spring/);
  await expect(page.getByText("International Women's Day")).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  const ics = await page.request.get("/calendar.ics");
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  test.skip(isMobile, "The phone header has no theme button");
  await page.getByRole("button", { name: "Switch theme" }).click();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(before);
});

test.describe("motion from the design", () => {
  test("a face is only the head, with no circle behind it", async ({ page }) => {
    await page.goto("/professors");
    const face = page.locator(".face").first();
    await expect(face).toHaveCSS("border-radius", "0px");
    await expect(face).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("the hero plays on the first load only", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".d-hero .word").first()).toHaveCSS("animation-name", "rise");
    await expect(page.locator(".d-hero .drop")).toHaveCSS("animation-name", "drop");
    await page.getByRole("link", { name: "All courses" }).first().click();
    await expect(page).toHaveURL(/\/courses$/);
    await page.goBack();
    await expect(page.locator(".d-hero .word").first()).toHaveCSS("animation-name", "none");
  });

  test("cards rise as they scroll into view, once", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 200 });
    await page.goto("/courses");
    const rises = () => page.evaluate(() => document.getAnimations().filter((a) => (a.effect as KeyframeEffect).target?.matches(".card")).length);
    const last = page.locator(".card").last();
    await expect(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      expect(await rises()).toBeGreaterThan(0);
    }).toPass();
    await expect(last).toBeVisible();
    await expect.poll(rises).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await rises()).toBe(0);
  });

  test("reduced motion turns every move into a short fade", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    const word = page.locator(".d-hero .word").first();
    await expect(word).toHaveCSS("animation-name", "fade");
    await expect(word).toHaveCSS("animation-duration", "0.12s");
    await context.close();
  });
});

test("every post can be read, with sure matches first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /All \d+ posts/ }).first().click();
  await expect(page).toHaveURL(/\/posts$/);
  await expect(page.getByText("Is MATH111 hard?")).toBeVisible();

  await page.goto("/professors/g-pinto");
  await page.getByRole("link", { name: "All 2 posts" }).click();
  const posts = page.locator(".post-full");
  await expect(posts).toHaveCount(2);
  await expect(posts.first()).toContainText("Second line of the post stays visible");
  await expect(page.locator(".card", { hasText: "found his card" }).getByText("Possible match")).toBeVisible();

  await page.getByRole("link", { name: "Newest" }).click();
  await expect(page).toHaveURL(/sort=new/);
  await expect(page.locator(".post-full").first()).toContainText("Pinto explains");
  expect(await noSideScroll(page)).toBe(true);
});

test("the course tabs follow the page and show counts apart from labels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto("/courses/MATH111");
  const tabs = page.getByRole("navigation", { name: "Course sections" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "location");
  const files = tabs.getByRole("link", { name: /^Files/ });
  await expect(files.locator(".tab-count")).toBeVisible();
  await expect(async () => {
    await files.click();
    await expect(files).toHaveAttribute("aria-current", "location", { timeout: 1000 });
  }).toPass();
  await expect(tabs.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current", "location");
  // The chosen tab holds through the jump, so the check starts once that is over.
  await page.waitForTimeout(800);
  await expect(async () => {
    await page.evaluate(() => window.scrollTo({ top: 60, behavior: "instant" }));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "location", { timeout: 500 });
  }).toPass();
});

test("files filter by semester, and by the group's courses once it is known", async ({ page, isMobile }) => {
  await page.goto("/files");
  await page.getByRole("link", { name: "Fall 2023", exact: true }).first().click();
  await expect(page).toHaveURL(/term=Fall/);
  await expect(page.locator(".file")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "My courses" })).toHaveCount(0);
  test.skip(isMobile, "Covered on desktop");
  await page.goto("/me/group");
  await page.getByLabel("Search group").fill("FCS");
  await page.getByRole("button", { name: "FCS 1" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/files?mine=1");
  await expect(page.getByRole("link", { name: "My courses" })).toBeVisible();
});

