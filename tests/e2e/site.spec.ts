import { expect, test } from "@playwright/test";

const noSideScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("home opens with search on the F key", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("respects");
  expect(await noSideScroll(page)).toBe(true);
  test.skip(isMobile, "No keyboard on a phone");
  await page.keyboard.press("f");
  await page.getByLabel("Search").last().fill("math111");
  await expect(page.getByRole("button", { name: /Calculus 1/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/courses\/MATH111/);
});

test("the F key opens one search panel", async ({ page, isMobile }) => {
  test.skip(isMobile, "No keyboard on a phone");
  await page.goto("/");
  await page.keyboard.press("f");
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("the search button works on every device", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByLabel("Search").last().fill("pinto");
  await expect(page.getByRole("button", { name: /Gonçalo Pinto/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("course page shows syllabus data, files and mentions", async ({ page }) => {
  await page.goto("/courses/MATH111#files");
  await expect(page.getByRole("heading", { name: "Calculus 1", level: 1 })).toBeVisible();
  for (const name of ["How it is graded", "Workload", "Week by week", "Books", "Where it fits", "Files", "What Anonymous says"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Precalculus" })).toBeVisible();
  await expect(page.getByText("Calculus 1 midterm.pdf")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Cyber Security" })).toBeVisible();
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
  await expect(page).toHaveURL(/\/me$/);
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

test("calendar and theme work", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByText("Midterm exams").first()).toBeVisible();
  await page.getByRole("button", { name: "Switch theme" }).click();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(before);
});
