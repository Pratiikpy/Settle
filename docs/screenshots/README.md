# Screenshots — capture guide

The repo's main README references images at this path. Drop captures here at the exact filenames below and they'll appear in the rendered README.

## Required (for the README to look complete)

| File | What to capture | Source |
|---|---|---|
| `hero.png` | Magic-moment terminal on the landing page mid-flight (a few rows visible, latest one ALLOW) | https://settle.so/?stay=1 |
| `panel-watch.png` | `/watch` agent demo with at least one ALLOW row + one DENY row visible | https://settle.so/watch |
| `panel-receipt.png` | A receipt poster on `/r/<id>` showing the verb badge + amount + 4-hash chain | open any receipt from `/feed` |
| `panel-dashboard.png` | `/dashboard` connected, showing Today's Spent + agent on duty + recent receipts | connect Phantom on devnet, hit /dashboard |
| `panel-crosschain.png` | `/watch-crosschain` ALLOW + DENY scenarios side-by-side | https://settle.so/watch-crosschain |

Optional but high-impact:

| File | What |
|---|---|
| `demo.gif` | 8–12 second loop of the magic-moment terminal animating (use ScreenToGif on Windows or Kap on macOS; export at ≤6 MB so GitHub renders inline) |

## Capture settings

- **Width:** 1280 px (desktop viewport). 1080 px also fine.
- **Format:** PNG for stills, GIF for the loop. Don't use JPEG — text turns blurry.
- **Browser chrome:** crop it out (so the screenshot is just the page content). Easiest with Firefox's built-in Screenshot tool or DevTools full-page screenshot in Chrome.
- **Connection state:** for `/dashboard` and `/watch`, capture *connected* (Phantom or burner). Empty-state screens look like the product is broken when it isn't.
- **Theme:** light theme. The product is designed light-first.
- **Live data:** wait until the magic-moment terminal has at least one row with a real `request_id` before capturing — don't ship an empty terminal.

## Why each one earns its place

- **`hero.png`** — proves the app is alive without scrolling. First impression in the README.
- **`panel-watch.png`** — proves the agent rail is real (ALLOW + DENY in one frame).
- **`panel-receipt.png`** — proves the on-chain receipt isn't a slogan; it's a thing you can see and verify.
- **`panel-dashboard.png`** — proves consumer surface, not just developer surface.
- **`panel-crosschain.png`** — proves the Settle × Ika sidetrack is shipped UI, not vapor.

Drop the files, commit, push. README renders them automatically.
