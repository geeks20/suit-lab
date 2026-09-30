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

/** Makes the mock provider fail every job (mock-only switch; real providers ignore it). */
export async function forceMockFailures(page: Page, on = true) {
  const ctx = page.context();
  if (on) await ctx.addCookies([{ name: "sl_mock_fail", value: "1", url: page.url() }]);
  else await ctx.clearCookies({ name: "sl_mock_fail" });
}
