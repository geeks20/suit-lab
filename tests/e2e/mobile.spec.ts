import { expect, test } from "@playwright/test";
import { useDemoModel } from "./helpers";

test.describe("mobile layout (390px)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 500, "mobile project only");

  test("image first, wardrobe and actions reachable, no horizontal scroll", async ({ page }) => {
    await useDemoModel(page);
    const vp = page.viewportSize()!;
    const stage = await page.getByRole("region", { name: "Your model" }).boundingBox();
    expect(stage!.y).toBeLessThan(80);
    expect(stage!.height).toBeGreaterThan(vp.height * 0.5);

    const generate = page.getByTestId("generate-look");
    await expect(generate).toBeInViewport();
    const box = await generate.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    await expect(page.getByRole("tab", { name: /Shoes/ })).toBeInViewport();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("tab", { name: /Shoes/ }).click();
    await page.getByRole("radio", { name: /Black Loafer/ }).click();
    await generate.click();
    await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "look", { timeout: 10_000 });
  });

  test("home has no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
