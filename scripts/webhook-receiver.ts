/**
 * Local webhook receiver for end-to-end testing of Settle's webhook delivery.
 *
 * Listens on :4000 for POSTs from the Settle indexer/cron, validates the
 * Settle-Signature HMAC, and logs every event to stdout + an in-memory ring buffer.
 *
 * Endpoints:
 *   POST /webhook        — primary receiver; validates HMAC, logs event
 *   GET  /events         — returns last 100 received events (JSON)
 *   GET  /events/:type   — returns last 100 events of a specific type
 *   POST /reset          — clears the buffer (for test isolation)
 *   GET  /health         — returns { ok: true }
 *
 * Configuration (env):
 *   WEBHOOK_SECRET       — HMAC secret (must match what Settle is signing with)
 *   WEBHOOK_PORT         — port to listen on (default 4000)
 *   WEBHOOK_FAIL_FIRST_N — return 500 for the first N requests (test retry logic)
 *
 * Run: pnpm tsx scripts/webhook-receiver.ts
 */
import "dotenv/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

const PORT = Number(process.env.WEBHOOK_PORT ?? 4000);
const SECRET = process.env.WEBHOOK_SECRET ?? "test-secret";
const FAIL_FIRST_N = Number(process.env.WEBHOOK_FAIL_FIRST_N ?? 0);

interface ReceivedEvent {
  receivedAt: string;
  signature: string | null;
  signatureValid: boolean;
  eventType: string | null;
  idempotencyKey: string | null;
  body: unknown;
  rawBytes: number;
}

const buffer: ReceivedEvent[] = [];
const MAX_BUFFER = 1000;

let requestCount = 0;
const seenIdempotencyKeys = new Set<string>();

function validateSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): { valid: boolean; reason?: string } {
  if (!signatureHeader) return { valid: false, reason: "missing header" };
  const parts = signatureHeader.split(",").map((p) => p.trim().split("="));
  const tsPart = parts.find((p) => p[0] === "t");
  const v1Part = parts.find((p) => p[0] === "v1");
  if (!tsPart || !v1Part) {
    return { valid: false, reason: "malformed header" };
  }
  const ts = tsPart[1];
  const givenSig = v1Part[1];
  const expected = createHmac("sha256", SECRET)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(givenSig, "hex");
    if (a.length !== b.length) {
      return { valid: false, reason: "length mismatch" };
    }
    const valid = timingSafeEqual(a, b);
    return { valid, reason: valid ? undefined : "hmac mismatch" };
  } catch {
    return { valid: false, reason: "decode error" };
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (method === "GET" && url === "/health") {
    return send(res, 200, { ok: true, port: PORT, bufferSize: buffer.length });
  }

  if (method === "GET" && url === "/events") {
    return send(res, 200, { count: buffer.length, events: buffer.slice(-100) });
  }

  if (method === "GET" && url.startsWith("/events/")) {
    const type = decodeURIComponent(url.slice("/events/".length));
    const filtered = buffer.filter((e) => e.eventType === type).slice(-100);
    return send(res, 200, { count: filtered.length, events: filtered });
  }

  if (method === "POST" && url === "/reset") {
    buffer.length = 0;
    seenIdempotencyKeys.clear();
    requestCount = 0;
    console.log("  [reset] buffer cleared");
    return send(res, 200, { ok: true });
  }

  if (method === "POST" && url === "/webhook") {
    requestCount += 1;

    if (requestCount <= FAIL_FIRST_N) {
      console.log(
        `  [webhook] req #${requestCount} → forced 500 (FAIL_FIRST_N=${FAIL_FIRST_N})`,
      );
      return send(res, 500, { ok: false, retry: true });
    }

    const raw = await readBody(req);
    const sigHeader = req.headers["settle-signature"] as string | undefined;
    const eventHeader = req.headers["settle-event"] as string | undefined;
    const idemHeader = req.headers["settle-idempotency-key"] as
      | string
      | undefined;

    const { valid, reason } = validateSignature(raw, sigHeader);

    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* keep raw if not JSON */
    }

    const event: ReceivedEvent = {
      receivedAt: new Date().toISOString(),
      signature: sigHeader ?? null,
      signatureValid: valid,
      eventType: eventHeader ?? null,
      idempotencyKey: idemHeader ?? null,
      body: parsed,
      rawBytes: raw.length,
    };

    if (idemHeader && seenIdempotencyKeys.has(idemHeader)) {
      console.log(
        `  [webhook] req #${requestCount} → DEDUPE ${eventHeader} idem=${idemHeader.slice(0, 8)}…`,
      );
      return send(res, 200, { ok: true, dedup: true });
    }
    if (idemHeader) seenIdempotencyKeys.add(idemHeader);

    buffer.push(event);
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);

    const status = valid ? "✓" : `✗ (${reason})`;
    console.log(
      `  [webhook] req #${requestCount} → ${status} ${eventHeader ?? "?"} ${raw.length}b`,
    );

    return send(res, 200, { ok: true, signatureValid: valid });
  }

  return send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log("");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`  WEBHOOK RECEIVER — listening on http://localhost:${PORT}`);
  console.log("════════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`  HMAC secret: ${SECRET.slice(0, 4)}…  (env WEBHOOK_SECRET)`);
  console.log(`  Fail first N: ${FAIL_FIRST_N}  (env WEBHOOK_FAIL_FIRST_N)`);
  console.log("");
  console.log("  Endpoints:");
  console.log(`    POST http://localhost:${PORT}/webhook    — primary receiver`);
  console.log(`    GET  http://localhost:${PORT}/events     — last 100 events`);
  console.log(`    GET  http://localhost:${PORT}/events/<type>  — filter by event type`);
  console.log(`    POST http://localhost:${PORT}/reset      — clear buffer`);
  console.log(`    GET  http://localhost:${PORT}/health     — health probe`);
  console.log("");
});

server.on("error", (e) => {
  console.error("✗ webhook receiver error:", e);
  process.exit(1);
});
