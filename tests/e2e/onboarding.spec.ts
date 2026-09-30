import { expect, test } from "@playwright/test";
import { makePhotoPng } from "./helpers";

test("upload photo, enter details and land in the studio", async ({ page, browser }) => {
  const helper = await browser.newPage();
  const png = await makePhotoPng(helper);
  await helper.close();

  await page.goto("/");
  await page.getByRole("link", { name: "Create My Model" }).click();
  await expect(page.getByRole("heading", { name: "Upload your photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await page.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Your uploaded photo")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Height").fill("183");
  await page.getByLabel("Weight").fill("72");
  await page.getByText("Slim", { exact: true }).click();
  await page.getByRole("button", { name: "Create My Model" }).click();

  await expect(page.getByText("Preparing your model…")).toBeVisible();
  await page.waitForURL("**/studio", { timeout: 15_000 });
  // Served privately from storage through a signed, expiring URL.
  await expect(page.getByTestId("stage-image")).toHaveAttribute("src", /^\/api\/files\/users\/[0-9a-f-]+\/profiles\/[0-9a-f-]+\/source\.jpg\?exp=\d+&sig=/);
  const src = await page.getByTestId("stage-image").getAttribute("src");
  expect((await page.request.get(src!)).status()).toBe(200);
  expect((await page.request.get(src!.replace(/sig=[^&]+/, "sig=forged"))).status()).toBe(403);
});

test("rejects an unusable upload with a friendly message", async ({ page }) => {
  await page.goto("/create");
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByRole("alert").filter({ hasText: "Please use a JPG, PNG or WebP photo." })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a jpeg") });
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't use this photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("validates body details", async ({ page, browser }) => {
  const helper = await browser.newPage();
  const png = await makePhotoPng(helper);
  await helper.close();
  await page.goto("/create");
  await page.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Height").fill("20");
  await page.getByRole("button", { name: "Create My Model" }).click();
  await expect(page.getByText("Enter a height between 130 and 230 cm")).toBeVisible();
  await expect(page).toHaveURL(/\/create$/);
});
