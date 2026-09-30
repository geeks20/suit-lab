import type { Page } from "@playwright/test";

/** A real PNG "photo" rendered by the browser from the demo illustration. */
export async function makePhotoPng(page: Page): Promise<Buffer> {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/demo-assets/model.svg");
  const png = await page.screenshot();
  return png;
}

export async function useDemoModel(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo model" }).click();
  await page.waitForURL("**/studio");
}

/** Makes the mock provider fail every job (dev/test hook, mock provider only). */
export async function forceMockFailures(page: Page) {
  await page.evaluate(() => localStorage.setItem("suitlab.mock.failureRate", "1"));
}
