import { expect, test } from "@playwright/test";

const noSideScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("sign-in shows the LMS form and explains a non-student login", async ({ page, isMobile }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in with LMS" })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.getByLabel("Email").fill("someone@gmail.com");
  await page.getByLabel("Password").fill("not-a-real-password");
  // Phones submit with the bottom (Telegram Main) button, desktop with the keycap button.
  // The desktop keycap lifts on hover, so click it without waiting for it to hold still.
  if (isMobile) await page.locator(".sh-bottombar button").click();
  else await page.locator(".sh-signin__actions").getByRole("button").first().click({ force: true });
  await expect(page.locator(".sh-field__error")).toContainText("isn't a student account");
  await expect(page.getByLabel("Password")).toHaveValue("not-a-real-password");
});

test("the shell frames every screen", async ({ page, isMobile }) => {
  // The test server signs in a dev student, so the app frame is the signed-in one.
  await page.goto("/timetable");
  await expect(page.getByRole("heading", { level: 1, name: "Timetable" })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  if (isMobile) {
    await expect(page.getByRole("link", { name: /Course, professor, file/ })).toBeVisible();
    return;
  }
  const nav = page.getByRole("navigation", { name: "Press F" });
  await expect(nav.getByRole("link", { name: /Timetable/ })).toHaveAttribute("aria-current", "page");
  // F then C jumps to Courses (keys work once the page is interactive, so retry).
  await expect(async () => {
    await page.keyboard.press("f");
    await page.keyboard.press("c");
    await expect(page).toHaveURL(/\/courses$/, { timeout: 2000 });
  }).toPass();
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  // ⌘K opens the palette.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible({ timeout: 1000 });
  }).toPass();
});

test("admin opens the review queue", async ({ page, isMobile }) => {
  test.skip(isMobile, "The admin is desktop only");
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
  await page.goto("/admin/uploads");
  await expect(page.getByRole("heading", { name: "Uploads" })).toBeVisible();
});
