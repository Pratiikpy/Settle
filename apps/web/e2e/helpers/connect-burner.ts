import type { Page } from "@playwright/test";

/**
 * Helper: connect the unsafe burner wallet adapter via the wallet
 * modal. Tests reuse this so we don't repeat selectors.
 */
export async function connectBurner(page: Page): Promise<void> {
  // Find the wallet trigger (any button rendered by wallet-adapter-react-ui).
  const trigger = page.locator(".wallet-adapter-button-trigger").first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });

  // If already connected (text matches truncated pubkey pattern), bail early.
  const currentText = await trigger.textContent();
  if (currentText && /[1-9A-HJ-NP-Za-km-z]{4}\.\.[1-9A-HJ-NP-Za-km-z]{4}/.test(currentText)) {
    return;
  }

  await trigger.click();

  const burner = page.locator(".wallet-adapter-modal-list li:has-text('Burner')");
  await burner.click();

  // Wait for the modal to close — the wallet adapter does this once the
  // wallet finishes connecting. Doing it via the modal rather than the
  // trigger text avoids a race when the connected page redirects away
  // (Wave 6: landing redirects to /dashboard on connect, unmounting the
  // landing's WalletMultiButton before the trigger text can flip).
  await page
    .locator(".wallet-adapter-modal")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {
      // Some browsers leave the modal in DOM but hidden — fall through.
    });

  // Final sanity: the burner is connected when EITHER the trigger text
  // shows a truncated pubkey (still on the same page) OR the URL has
  // changed (we redirected away after connect).
  await page.waitForFunction(
    () => {
      const t = document.querySelector(
        ".wallet-adapter-button-trigger",
      ) as HTMLElement | null;
      const triggerHasPubkey =
        !!t &&
        /[1-9A-HJ-NP-Za-km-z]{4}\.\.[1-9A-HJ-NP-Za-km-z]{4}/.test(
          t.textContent ?? "",
        );
      // W6 connected wallet button shows the truncated pubkey too, in any
      // span containing the dot-dot pattern.
      const anyConnectedChip = Array.from(
        document.querySelectorAll("span, button"),
      ).some((el) =>
        /[1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}/.test(
          el.textContent ?? "",
        ),
      );
      return triggerHasPubkey || anyConnectedChip;
    },
    { timeout: 10_000 },
  );
}

/**
 * Helper: read the burner's connected pubkey (full, not truncated)
 * from the React wallet adapter state via window.
 */
export async function getBurnerPubkey(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // wallet-adapter doesn't expose this on window by default; we
    // compute it from the truncated text + a stash on the page.
    // Easiest: ask the trigger button's title (often full pubkey).
    const t = document.querySelector(".wallet-adapter-button-trigger") as
      | HTMLElement
      | null;
    return t?.getAttribute("title") ?? t?.textContent ?? null;
  });
}
