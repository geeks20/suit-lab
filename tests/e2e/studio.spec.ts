import { expect, test } from "@playwright/test";
import { forceMockFailures, useDemoModel } from "./helpers";

test("studio without a model shows the empty state", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByText("Create your model before entering the studio.")).toBeVisible();
});

test("garment selection is kept per category and survives reload", async ({ page }) => {
  await useDemoModel(page);
  await page.getByRole("tab", { name: /Ties/ }).click();
  await page.getByRole("radio", { name: /Forest Green/ }).click();
  await page.getByRole("tab", { name: /Suits/ }).click();
  await page.getByRole("radio", { name: /Charcoal/ }).click();

  await page.reload();
  await expect(page.getByRole("radio", { name: /Charcoal/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("tab", { name: /Ties/ }).click();
  await expect(page.getByRole("radio", { name: /Forest Green/ })).toHaveAttribute("aria-checked", "true");
});

test("selecting garments does not generate; Generate Look does", async ({ page }) => {
  await useDemoModel(page);
  await page.getByRole("tab", { name: /Shirts/ }).click();
  await page.getByRole("radio", { name: /Light Blue/ }).click();
  await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "original");

  await page.getByTestId("generate-look").click();
  await expect(page.getByText("Creating your look…")).toBeVisible();
  await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "look", { timeout: 10_000 });
  await expect(page.getByTestId("generate-look")).toHaveText("Up to date");

  // Before / after
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "original");
  await page.getByRole("button", { name: "Look", exact: true }).click();
  await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "look");

  // Changing an item flags the look as stale.
  await page.getByRole("radio", { name: /Ivory/ }).click();
  await expect(page.getByText("Outfit changed · Generate to see it")).toBeVisible();
});

test("failed generation recovers with Try Again", async ({ page }) => {
  await useDemoModel(page);
  await forceMockFailures(page);
  await page.reload();
  await page.getByTestId("generate-look").click();
  const alert = page.getByRole("alert").filter({ hasText: "That look didn't generate properly." });
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert.getByRole("button", { name: "Try Again" })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem("suitlab.mock.failureRate"));
  await page.reload();
  await page.getByTestId("generate-look").click();
  await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "look", { timeout: 10_000 });
});

test("save a look, rename it in My Looks and reopen it", async ({ page }) => {
  await useDemoModel(page);
  await expect(page.getByRole("button", { name: "Save Look" })).toBeDisabled();
  await page.getByTestId("generate-look").click();
  await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "look", { timeout: 10_000 });
  await page.getByRole("button", { name: "Save Look" }).click();
  await expect(page.getByText("Saved as Look 01")).toBeVisible();

  await page.getByRole("link", { name: "My Looks" }).first().click();
  const card = page.getByTestId("look-card");
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Rename Look 01" }).click();
  await card.getByLabel("Look name").fill("Riyadh dinner");
  await card.getByLabel("Look name").press("Enter");
  await expect(card.getByRole("button", { name: "Rename Riyadh dinner" })).toBeVisible();

  await card.getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForURL("**/studio");
  await expect(page.getByTestId("stage-image")).toHaveAttribute("data-view", "look");
});

test("My Looks empty state", async ({ page }) => {
  await page.goto("/looks");
  await expect(page.getByText("You haven't saved a look yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a Look" })).toBeVisible();
});

test("wardrobe is keyboard operable", async ({ page }) => {
  await useDemoModel(page);
  const suitsTab = page.getByRole("tab", { name: /Suits/ });
  await suitsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Shirts/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: /Crisp White/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Light Blue/ })).toHaveAttribute("aria-checked", "true");
});
