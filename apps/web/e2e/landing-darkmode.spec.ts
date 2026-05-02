import { test, expect } from "@playwright/test";

test("landing .w6-btn-primary has white text on dark bg", async ({ page }) => {
  await page.goto("/");
  // Bug history: `[data-w6-page] a { color: inherit }` was overriding
  // `.w6-btn-primary { color: #fff }` → black-on-black, button text
  // invisible. Excluded a[class*="w6-btn"] from the inherit reset.
  const btn = page.locator("a.w6-btn-primary").first();
  await btn.waitFor({ state: "visible" });
  const result = await btn.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return { color: cs.color, bg: cs.backgroundColor };
  });
  expect(result.color).toBe("rgb(255, 255, 255)");
  expect(result.bg).toBe("rgb(9, 9, 11)");
});

test("landing reads light with system dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  // theme-init.js applies html.dark from prefers-color-scheme
  await page.waitForFunction(
    () => document.documentElement.classList.contains("dark"),
    null,
    { timeout: 5000 },
  ).catch(() => {});
  // The [data-w6-page] wrapper must have dark text (--w6-ink = #09090b)
  const result = await page.evaluate(() => {
    const wrapper = document.querySelector("[data-w6-page]") as HTMLElement;
    const card = document.querySelector(".w6-card") as HTMLElement;
    return {
      wrapperColor: wrapper ? window.getComputedStyle(wrapper).color : null,
      htmlClasses: document.documentElement.className,
      cardColor: card ? window.getComputedStyle(card).color : null,
    };
  });
  console.log("RESULT:", JSON.stringify(result, null, 2));
  expect(result.wrapperColor).toBe("rgb(9, 9, 11)");
});

test("dashboard reads light with system dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?stay=1");
  // burner connect (skip if not E2E env, will fail gracefully)
  const trigger = page.locator(".wallet-adapter-button-trigger").first();
  if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
    await trigger.click();
    const burner = page.locator(".wallet-adapter-modal-list li:has-text('Burner')");
    if (await burner.isVisible({ timeout: 3000 }).catch(() => false)) {
      await burner.click();
    }
  }
  await page.goto("/dashboard");
  await page.waitForFunction(
    () => document.body.getAttribute("data-w6") === "1",
    null,
    { timeout: 30_000 },
  );
  const result = await page.evaluate(() => ({
    bodyColor: window.getComputedStyle(document.body).color,
    bodyBg: window.getComputedStyle(document.body).backgroundColor,
    htmlClasses: document.documentElement.className,
  }));
  console.log("DASH RESULT:", JSON.stringify(result, null, 2));
  expect(result.bodyColor).toBe("rgb(9, 9, 11)");
});
