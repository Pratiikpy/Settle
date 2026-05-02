/**
 * F7.12 — Deterministic intent parser.
 *
 * Pure regex-based parser for canonical send commands. Used as the
 * floor in /api/intent/parse so users always get an answer for
 * the most common phrasings even when LLM providers are unavailable.
 *
 * Two patterns covered:
 *   1. "send|pay <recipient> <amount> [usdc] [for <note>]"
 *   2. "transfer <amount> [usdc] to <recipient> [for <note>]"
 *
 * recipient is either an @handle, a raw handle, or a base58 pubkey.
 * Tests live alongside this file so the API route can import a tested
 * function without dragging vitest into apps/web.
 */

const HANDLE_RE = /^[a-z0-9_-]{2,32}$/i;
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface ParsedIntent {
  action: "direct_send" | "save_for" | "schedule";
  recipient_handle: string | null;
  recipient_pubkey: string | null;
  amount_usdc: string;
  amount_lamports: string | null;
  note: string | null;
  confidence: number;
  /**
   * For action='schedule', cadence inferred from the phrasing.
   * Otherwise null.
   */
  cadence?: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  /**
   * For action='save_for', the goal label extracted (e.g. "AWS bill").
   * Otherwise null.
   */
  goal_label?: string | null;
}

/**
 * Parse a single payment command. Returns `null` when no canonical
 * phrasing matches — caller (/api/intent/parse) falls through to LLM
 * providers in that case.
 *
 * Match order matters: the schedule + save_for patterns are tried
 * BEFORE direct_send because a phrasing like "send alice 5 every week"
 * would match direct_send's regex if we tried that first (it greedily
 * captures the trailing "every week" as a note). Schedule pattern is
 * the more specific match; we prefer specificity.
 */
export function parseIntentRegex(raw: string): ParsedIntent | null {
  const text = raw.trim().toLowerCase();

  // Pattern S: schedule — "send|pay <recipient> <amount> every <cadence>"
  // or "<cadence>, send|pay <recipient> <amount>". Cadence vocab:
  //   "day"/"daily" → DAILY
  //   "week"/"weekly"/"sunday|monday|..." → WEEKLY
  //   "month"/"monthly"/"1st|2nd|...|28th" → MONTHLY
  const sched = text.match(
    /^(?:send|pay)\s+(@?[\w-]+|[1-9a-hj-np-za-km-z]{32,44})\s+\$?(\d+(?:\.\d+)?)\s*(?:usdc|usd|dollars?)?\s+every\s+(day|daily|week|weekly|month|monthly|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{1,2}(?:st|nd|rd|th))(?:\s+(?:for|with note|note)\s+(.+))?$/i,
  );
  if (sched) {
    const recipient = sched[1]!.replace(/^@/, "");
    const cadenceWord = sched[3]!.toLowerCase();
    const cadence = inferCadence(cadenceWord);
    return classifyScheduleOrSend(
      "schedule",
      recipient,
      sched[2]!,
      sched[4] ?? null,
      0.95,
      cadence,
      null,
    );
  }

  // Pattern V: save-for — "save <amount> for <goal>" or
  // "set aside <amount> for <goal>" or "put aside <amount> for <goal>".
  const save = text.match(
    /^(?:save|set aside|put aside)\s+\$?(\d+(?:\.\d+)?)\s*(?:usdc|usd|dollars?)?\s+for\s+(.+)$/i,
  );
  if (save) {
    return classifyScheduleOrSend(
      "save_for",
      null,
      save[1]!,
      null,
      0.95,
      null,
      save[2]!.trim().replace(/[.!?]+$/, ""),
    );
  }

  // Pattern A: "send|pay <recipient> <amount> [usdc] [for <note>]"
  const a = text.match(
    /^(?:send|pay)\s+(@?[\w-]+|[1-9a-hj-np-za-km-z]{32,44})\s+\$?(\d+(?:\.\d+)?)\s*(?:usdc|usd|dollars?)?(?:\s+(?:for|with note|note)\s+(.+))?$/i,
  );
  if (a) {
    const recipient = a[1]!.replace(/^@/, "");
    return classifyRecipient(recipient, a[2]!, a[3] ?? null, 0.95);
  }
  // Pattern B: "transfer <amount> [usdc] to <recipient> [for <note>]"
  const b = text.match(
    /^transfer\s+\$?(\d+(?:\.\d+)?)\s*(?:usdc|usd|dollars?)?\s+to\s+(@?[\w-]+|[1-9a-hj-np-za-km-z]{32,44})(?:\s+(?:for|with note|note)\s+(.+))?$/i,
  );
  if (b) {
    const recipient = b[2]!.replace(/^@/, "");
    return classifyRecipient(recipient, b[1]!, b[3] ?? null, 0.95);
  }
  return null;
}

/**
 * Map a cadence vocab word to one of three on-chain cadences. Day-of-week
 * names imply WEEKLY (the user's intent is "every Sunday" → weekly cadence
 * with day_of_period=0). Day-of-month numbers imply MONTHLY.
 */
function inferCadence(word: string): "DAILY" | "WEEKLY" | "MONTHLY" {
  if (word === "day" || word === "daily") return "DAILY";
  if (word === "month" || word === "monthly") return "MONTHLY";
  if (/\d{1,2}(?:st|nd|rd|th)/.test(word)) return "MONTHLY";
  // Everything else (week, weekly, sunday..saturday) → WEEKLY.
  return "WEEKLY";
}

function classifyScheduleOrSend(
  action: "save_for" | "schedule",
  recipientRaw: string | null,
  amountUsdcStr: string,
  note: string | null,
  confidence: number,
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | null,
  goalLabel: string | null,
): ParsedIntent {
  const isPubkey = recipientRaw ? PUBKEY_RE.test(recipientRaw) : false;
  const isHandle = recipientRaw && !isPubkey ? HANDLE_RE.test(recipientRaw) : false;
  const amountFloat = parseFloat(amountUsdcStr);
  const amountLamports = Number.isFinite(amountFloat)
    ? Math.round(amountFloat * 1_000_000).toString()
    : null;
  return {
    action,
    recipient_handle: isHandle ? recipientRaw!.toLowerCase() : null,
    recipient_pubkey: isPubkey ? recipientRaw : null,
    amount_usdc: amountUsdcStr,
    amount_lamports: amountLamports,
    note: note ? note.trim().replace(/[.!?]+$/, "") : null,
    confidence,
    cadence,
    goal_label: goalLabel,
  };
}

function classifyRecipient(
  raw: string,
  amountUsdcStr: string,
  note: string | null,
  confidence: number,
): ParsedIntent {
  const isPubkey = PUBKEY_RE.test(raw);
  const isHandle = !isPubkey && HANDLE_RE.test(raw);
  const amountFloat = parseFloat(amountUsdcStr);
  const amountLamports = Number.isFinite(amountFloat)
    ? Math.round(amountFloat * 1_000_000).toString()
    : null;
  return {
    action: "direct_send",
    recipient_handle: isHandle ? raw.toLowerCase() : null,
    recipient_pubkey: isPubkey ? raw : null,
    amount_usdc: amountUsdcStr,
    amount_lamports: amountLamports,
    note: note ? note.trim().replace(/[.!?]+$/, "") : null,
    confidence,
  };
}

/**
 * F7.6 — Round-up delta computation.
 *
 * Given an amount and a round_to granularity (in lamports), returns
 * how much would round it up to the next multiple. Returns 0n when the
 * amount is already an exact multiple.
 *
 * Examples (round_to = 1_000_000 = $1):
 *   $1.30 (1300000 lamports) → 700000 lamports ($0.70)
 *   $1.00 → 0n (no round-up)
 *   $0.05 → 950000 lamports ($0.95)
 */
export function roundUpDelta(amountLamports: bigint, roundTo: bigint): bigint {
  if (roundTo <= 0n) return 0n;
  const remainder = amountLamports % roundTo;
  if (remainder === 0n) return 0n;
  return roundTo - remainder;
}

/**
 * F7.3 — Next-fire-at calculation for scheduled sends.
 *
 * Given a cadence + day_of_period + time_of_day, returns the next UTC
 * datetime the schedule should fire. Mirrors the logic in
 * /api/scheduled-sends so the test suite can lock its behavior.
 *
 * Cadence rules:
 *   DAILY: next occurrence of HH:MM (today if not yet, else tomorrow)
 *   WEEKLY: next occurrence of (day_of_period 0..6 = Sun..Sat) at HH:MM
 *   MONTHLY: next occurrence of day-of-month (1..28) at HH:MM
 */
export function nextFireAtUtc(args: {
  cadence: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfPeriod?: number;
  timeOfDay: string; // "HH:MM"
  now?: Date; // injectable for tests
}): Date {
  const now = args.now ?? new Date();
  const [hh, mm] = args.timeOfDay.split(":").map((n) => parseInt(n, 10));
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0),
  );
  if (args.cadence === "DAILY") {
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }
  if (args.cadence === "WEEKLY") {
    const wantDow = args.dayOfPeriod ?? 0;
    const curDow = candidate.getUTCDay();
    let delta = (wantDow - curDow + 7) % 7;
    if (delta === 0 && candidate <= now) delta = 7;
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    return candidate;
  }
  // MONTHLY
  const wantDom = args.dayOfPeriod ?? 1;
  candidate.setUTCDate(wantDom);
  if (candidate <= now) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  return candidate;
}
