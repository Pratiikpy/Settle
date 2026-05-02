# WAVE_6_MOTION — animation catalog

Every motion in the redesigned app, defined. **Reduced motion overrides** specified per item. **60fps mobile target.** No motion that requires layout reflow inside an animation frame.

Stack: **Framer Motion** (existing dependency) for orchestration; **CSS transitions** for micro-interactions; **Lottie nowhere** (too heavy).

---

## Existing animations (keep, port to new shell)

| Name | Where | Implementation | Status |
|---|---|---|---|
| Frost-shatter on revoke | `packages/ui/src/pact-card.tsx` | CSS keyframes + opacity/blur transition | KEEP, verify in new shell |
| Hash-chain reveal | `packages/ui/src/hash-chain-animation.tsx` | Sequential SVG path stroke-dashoffset | KEEP |
| Confetti on settle | `apps/web/lib/confetti.ts` (canvas-confetti) | Existing | KEEP |
| Drag-share receipt | `packages/ui/src/draggable-receipt.tsx` | Framer drag + spring | KEEP |
| Slide-to-confirm | `packages/ui/src/slide-to-confirm.tsx` | Framer drag with threshold | KEEP |
| TrustGesture (subtle nod) | `packages/ui/src/trust-gesture.tsx` | Framer animate | KEEP |

---

## New animations needed

### 1. Surface switcher pill slide
**Where:** Topbar mode pill (Consumer / Agent / etc.)
**Behavior:** Active background slides from previously-active to newly-active pill.
**Implementation:** Framer `LayoutGroup` + `layoutId="surface-pill-bg"` on the active pill's bg div. 200ms easeOut.
**Reduced motion:** No animation — instant swap, no `layoutId`.
**Performance:** GPU compositing only (transform), no layout.

### 2. Sidebar nav active indicator
**Where:** Sidebar nav-link active state
**Behavior:** When user navigates, the inset border-left slides from previous to new active item.
**Implementation:** Framer `LayoutGroup` + `layoutId="sidebar-active"` on the active link's `::before` pseudo or absolutely-positioned div.
**Reduced motion:** Instant.

### 3. Bento card hover lift
**Where:** Every `BentoCard` (default + variants)
**Behavior:** translateY(-3px) + border darken on hover; 220ms transition. Click = brief scale 0.98 then back.
**Implementation:** CSS transition on `transform` + `border-color`.
**Reduced motion:** Transition removed; border darken stays (cue is still present).
**Performance:** GPU-only.

### 4. Stats strip count-up (landing)
**Where:** Landing stats strip (`$1.04M / 400ms / 18`)
**Behavior:** Numbers animate from 0 to target over 600ms when first scrolled into view.
**Implementation:** Framer `useMotionValue` + `useTransform` + IntersectionObserver. Numbers formatted with `toFixed` + `.toLocaleString`.
**Reduced motion:** Skip animation, render final values immediately.
**Performance:** Single number per frame, no DOM thrash.

### 5. Topbar wallet popover
**Where:** Click on wallet button (connected state)
**Behavior:** Popover fades in + translates up 8px over 180ms.
**Implementation:** Framer `AnimatePresence` + `motion.div` with `initial`/`animate`/`exit`.
**Reduced motion:** Instant fade only.

### 6. Tab switches (e.g. /send recipient tabs)
**Where:** Send page tab `[@handle] [pubkey] [link] [QR]`
**Behavior:** Active tab indicator slides; tab body cross-fades over 200ms.
**Implementation:** `LayoutGroup` for indicator; `AnimatePresence` for body.
**Reduced motion:** Instant.

### 7. Send button state machine
**Where:** Send page primary button
**States:** idle → "Building tx…" → "Sign in your wallet" → "Confirming on Solana…" → "Sent ✓"
**Behavior:** Text cross-fades (100ms each), button bg color shifts (idle=accent, building=zinc, signing=amber, confirming=blue, sent=emerald), final state pulses once + fires confetti.
**Implementation:** State machine in component; Framer `motion.span` for text crossfade; CSS for bg.
**Reduced motion:** No pulse; instant text swap; confetti respects user's `prefers-reduced-motion` (canvas-confetti supports this).

### 8. Hero parallax on landing
**Where:** Landing hero AgentCard demo
**Behavior:** Subtle parallax — card translates max -12px on scroll, scrubbed.
**Implementation:** Framer `useScroll` + `useTransform`.
**Reduced motion:** Disabled.
**Performance:** Single transform, no layout.

### 9. Recent receipts row hover
**Where:** Dashboard recent receipts table rows
**Behavior:** Bg `var(--rule-2)` on hover, 120ms.
**Implementation:** CSS.
**Reduced motion:** Keep — too small to matter.

### 10. Sparkline draw on mount
**Where:** Dashboard "Today" sparkline
**Behavior:** SVG path draws left-to-right over 800ms via `stroke-dashoffset`.
**Implementation:** CSS animation.
**Reduced motion:** Skip animation, render full path.

### 11. Cluster badge pulse (mainnet only)
**Where:** Topbar cluster badge dot
**Behavior:** Soft pulse on the dot (mainnet only, never devnet — devnet is yellow + static).
**Implementation:** CSS keyframe scale + box-shadow expansion.
**Reduced motion:** Disabled.

### 12. Page transitions (route changes)
**Where:** Between authed routes
**Behavior:** None. Routes change instantly. No fade-between-pages — Next.js handles loading.tsx skeletons.
**Reasoning:** Page transitions look slick in demos but feel sluggish in real use, especially on mobile. Skip.

### 13. Bottom-tab drawer (mobile sidebar)
**Where:** Mobile <768px, "More" tap opens drawer
**Behavior:** Drawer slides up from bottom, 240ms easeOut. Backdrop fades in.
**Implementation:** Framer `motion.aside` with `initial={{ y: '100%' }}` and `animate={{ y: 0 }}`.
**Reduced motion:** Instant snap.

### 14. Devnet banner slide-in
**Where:** Top of app when `cluster === 'devnet'`
**Behavior:** Banner slides down from top on first mount, 300ms. Sticky after.
**Implementation:** Framer `initial={{ y: -32 }}` `animate={{ y: 0 }}`.
**Reduced motion:** Instant.

### 15. Form validation shake
**Where:** Email capture, send amount input — when validation fails on submit
**Behavior:** Input shakes horizontally 3 times over 280ms.
**Implementation:** Framer animate keyframes `[0, -8, 8, -4, 4, 0]`.
**Reduced motion:** Skip shake; show inline error text only.

### 16. Skeleton loaders
**Where:** Every async cell during initial fetch
**Behavior:** Shimmer (gradient sweep) over the skeleton block.
**Implementation:** CSS keyframe linear-gradient translate.
**Reduced motion:** Static gray block, no shimmer.

---

## Performance constraints

- **Every animation must be GPU-compositable** (transform / opacity only, no layout properties).
- **Animations >300ms forbidden** for interaction feedback (hover, click, tab switch, button state).
- **Animations >800ms forbidden** for content reveal (count-up, sparkline draw).
- **Total Framer Motion bundle ≤ 50KB gzipped on landing page** — verify after Wave 6.0 build.
- **Test on a low-end Android (Galaxy A series-equivalent throttle in Chrome devtools)** for jank.

## Reduced-motion strategy

Global hook in `apps/web/lib/use-reduced-motion.ts`:
```ts
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
```

Every motion above checks this and downgrades to instant or removed.

## Animation review gate

Before Wave 6.7 ship, every animation:
1. Has a defined reduced-motion behavior
2. Is documented above (no surprises)
3. Has been observed at 60fps on Chrome devtools "Slow 4G + 4× CPU throttle"
4. Doesn't create layout shift in the page that hosts it
