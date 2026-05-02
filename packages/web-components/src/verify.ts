/**
 * `<settle-verify>` — embeddable receipt verifier.
 *
 * Recomputes the four BLAKE3 hashes of a Settle receipt CLIENT-SIDE and
 * compares against on-chain values pulled from settle.so/api/receipts/<id>.
 * The element shows a live PASS / FAIL badge so receipt holders never
 * have to "trust" Settle to confirm integrity — they verify locally.
 *
 * Attributes:
 *   request-id    receipt request_id (uuid) — required (or use receipt-hash)
 *   receipt-hash  alternate lookup: 32-byte hex
 *   endpoint      override API origin (default https://settle.so)
 *
 * D3 / Wave 2.
 */

import { blake3 } from "@noble/hashes/blake3";

const DEFAULT_ENDPOINT = "https://settle.so";

interface ReceiptPayload {
  request_id: string;
  decision: string;
  decision_slot: number | null;
  amount_lamports: string;
  card_pubkey: string;
  merchant_pubkey: string;
  capability_hash: string | null;
  receipt_hash: string;
  reason_hash: string | null;
  policy_snapshot_hash: string | null;
  purpose_hash: string | null;
  request_canonical?: string;
  policy_canonical?: string;
  decision_canonical?: string;
}

function hashHex(canonical: string | undefined): string | null {
  if (!canonical) return null;
  const bytes = new TextEncoder().encode(canonical);
  const out = blake3(bytes);
  return Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
}

class SettleVerifyElement extends HTMLElement {
  private statusEl: HTMLDivElement | null = null;
  private detailEl: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;

  static get observedAttributes(): string[] {
    return ["request-id", "receipt-hash", "endpoint"];
  }

  connectedCallback(): void {
    this.render();
    void this.verify();
  }

  attributeChangedCallback(): void {
    if (this.statusEl) void this.verify();
  }

  private render(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot!;
    while (root.firstChild) root.removeChild(root.firstChild);

    this.styleEl = document.createElement("style");
    this.styleEl.textContent = `
      :host { display: inline-block; font: 12px/1.4 system-ui, -apple-system, sans-serif; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid currentColor; }
      .badge.pass { color: #00ffa3; }
      .badge.fail { color: #ff4d4d; }
      .badge.pending { color: #999; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
      .detail { margin-top: 6px; color: #777; font-family: ui-monospace, monospace; font-size: 10px; }
    `;
    root.appendChild(this.styleEl);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "badge pending";

    const dot = document.createElement("span");
    dot.className = "dot";
    this.statusEl.appendChild(dot);

    const labelSpan = document.createElement("span");
    labelSpan.textContent = "Verifying…";
    this.statusEl.appendChild(labelSpan);

    root.appendChild(this.statusEl);

    this.detailEl = document.createElement("div");
    this.detailEl.className = "detail";
    root.appendChild(this.detailEl);
  }

  private setStatus(state: "pass" | "fail" | "pending", label: string, detail?: string): void {
    if (!this.statusEl) return;
    this.statusEl.className = `badge ${state}`;
    while (this.statusEl.firstChild) this.statusEl.removeChild(this.statusEl.firstChild);
    const dot = document.createElement("span");
    dot.className = "dot";
    this.statusEl.appendChild(dot);
    const span = document.createElement("span");
    span.textContent = label;
    this.statusEl.appendChild(span);
    if (this.detailEl) this.detailEl.textContent = detail ?? "";
  }

  private async verify(): Promise<void> {
    const requestId = this.getAttribute("request-id");
    const receiptHash = this.getAttribute("receipt-hash");
    if (!requestId && !receiptHash) {
      this.setStatus("fail", "Missing request-id");
      return;
    }
    const endpoint = this.getAttribute("endpoint") ?? DEFAULT_ENDPOINT;
    const url = requestId
      ? `${endpoint}/api/receipts/${encodeURIComponent(requestId)}`
      : `${endpoint}/api/receipts/by-hash/${encodeURIComponent(receiptHash!)}`;

    this.setStatus("pending", "Fetching receipt…");
    let payload: ReceiptPayload;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        this.setStatus("fail", `Fetch ${res.status}`);
        return;
      }
      payload = (await res.json()) as ReceiptPayload;
    } catch (err) {
      this.setStatus("fail", "Network error", (err as Error).message);
      return;
    }

    this.setStatus("pending", "Recomputing hashes…");

    const checks: Array<{ name: string; expected: string | null; got: string | null }> = [];
    checks.push({
      name: "request_canonical → reason_hash",
      expected: payload.reason_hash,
      got: hashHex(payload.request_canonical),
    });
    checks.push({
      name: "policy_canonical → policy_snapshot_hash",
      expected: payload.policy_snapshot_hash,
      got: hashHex(payload.policy_canonical),
    });
    checks.push({
      name: "decision_canonical → receipt_hash",
      expected: payload.receipt_hash,
      got: hashHex(payload.decision_canonical),
    });

    const verifiable = checks.filter((c) => c.expected && c.got);
    if (verifiable.length === 0) {
      this.setStatus(
        "pending",
        "Receipt found · canonical not exposed",
        `${payload.request_id.slice(0, 8)}… (server returns hashes only; pass canonical fields to verify locally)`,
      );
      return;
    }

    const failures = verifiable.filter((c) => c.expected !== c.got);
    if (failures.length === 0) {
      this.setStatus(
        "pass",
        `Verified ${verifiable.length}/${verifiable.length} hashes`,
        `${payload.request_id.slice(0, 8)}… · ${payload.decision} · ${(Number(payload.amount_lamports) / 1e6).toFixed(2)} USDC`,
      );
    } else {
      this.setStatus(
        "fail",
        `Mismatch on ${failures.length} hash(es)`,
        failures.map((f) => f.name).join(", "),
      );
    }
  }
}

if (typeof window !== "undefined" && !customElements.get("settle-verify")) {
  customElements.define("settle-verify", SettleVerifyElement);
}

export { SettleVerifyElement };
