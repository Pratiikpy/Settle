/**
 * `<settle-pay>` — embeddable pay button.
 *
 * Opens an iframe at https://settle.so/embed/pay?merchant=…&amount=…&note=…
 * so the user's wallet connection stays on settle.so — the host page
 * never touches keys or transaction signatures.
 *
 * Attributes:
 *   merchant     base58 pubkey of the receiving merchant (required)
 *   amount       USDC decimal string, e.g. "0.50" (required)
 *   note         optional label shown in the modal
 *   capability   optional capability_hash (hex) — pins the payment to a spec
 *   endpoint     override iframe origin (default https://settle.so)
 *
 * Events dispatched on the element:
 *   settle-paid   { detail: { request_id, receipt_hash } }
 *   settle-error  { detail: { code, message } }
 *   settle-closed { detail: {} }
 *
 * D2 / Wave 2.
 */

const DEFAULT_ENDPOINT = "https://settle.so";

interface SettleMessage {
  type: "settle:paid" | "settle:error" | "settle:closed";
  request_id?: string;
  receipt_hash?: string;
  code?: string;
  message?: string;
}

class SettlePayElement extends HTMLElement {
  private overlay: HTMLDivElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private buttonEl: HTMLButtonElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private messageHandler = (e: MessageEvent) => this.onMessage(e);

  static get observedAttributes(): string[] {
    return ["merchant", "amount", "note", "capability", "endpoint", "label"];
  }

  connectedCallback(): void {
    this.render();
    window.addEventListener("message", this.messageHandler);
  }

  disconnectedCallback(): void {
    window.removeEventListener("message", this.messageHandler);
    this.closeModal();
  }

  attributeChangedCallback(): void {
    if (this.buttonEl) this.updateLabel();
  }

  private render(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot!;
    while (root.firstChild) root.removeChild(root.firstChild);

    this.styleEl = document.createElement("style");
    this.styleEl.textContent = `
      :host { display: inline-block; }
      button {
        font: 500 14px/1 system-ui, -apple-system, sans-serif;
        padding: 10px 18px;
        border-radius: 999px;
        border: 0;
        background: #00ffa3;
        color: #000;
        cursor: pointer;
        transition: transform 80ms ease, opacity 80ms ease;
      }
      button:hover { transform: translateY(-1px); }
      button:active { transform: translateY(0); }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    root.appendChild(this.styleEl);

    this.buttonEl = document.createElement("button");
    this.buttonEl.type = "button";
    this.buttonEl.setAttribute("part", "button");
    this.updateLabel();
    this.buttonEl.addEventListener("click", () => this.openModal());
    root.appendChild(this.buttonEl);
  }

  private updateLabel(): void {
    if (!this.buttonEl) return;
    const amount = this.getAttribute("amount") ?? "0";
    const label = this.getAttribute("label") ?? `Pay $${amount} with Settle`;
    this.buttonEl.textContent = label;
  }

  private openModal(): void {
    const merchant = this.getAttribute("merchant");
    const amount = this.getAttribute("amount");
    if (!merchant || !amount) {
      this.dispatchEvent(
        new CustomEvent("settle-error", {
          detail: { code: "missing_attr", message: "merchant + amount required" },
        }),
      );
      return;
    }
    const endpoint = this.getAttribute("endpoint") ?? DEFAULT_ENDPOINT;
    const params = new URLSearchParams({ merchant, amount });
    const note = this.getAttribute("note");
    if (note) params.set("note", note);
    const capability = this.getAttribute("capability");
    if (capability) params.set("capability", capability);
    const url = `${endpoint}/embed/pay?${params.toString()}`;

    this.overlay = document.createElement("div");
    this.overlay.setAttribute("data-settle-overlay", "");
    Object.assign(this.overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.6)",
      zIndex: "2147483640",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    } satisfies Partial<CSSStyleDeclaration>);
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.closeModal("user_dismissed");
    });

    this.iframe = document.createElement("iframe");
    this.iframe.src = url;
    this.iframe.allow = "clipboard-write; payment";
    Object.assign(this.iframe.style, {
      width: "min(440px, 92vw)",
      height: "min(640px, 92vh)",
      border: "0",
      borderRadius: "16px",
      background: "#0b0b0b",
    } satisfies Partial<CSSStyleDeclaration>);

    this.overlay.appendChild(this.iframe);
    document.body.appendChild(this.overlay);
  }

  private closeModal(_reason?: string): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.iframe = null;
      this.dispatchEvent(new CustomEvent("settle-closed", { detail: {} }));
    }
  }

  private onMessage(e: MessageEvent): void {
    if (!this.iframe) return;
    const expectedOrigin = this.getAttribute("endpoint") ?? DEFAULT_ENDPOINT;
    if (e.origin !== expectedOrigin && !expectedOrigin.startsWith(e.origin)) return;
    const data = e.data as SettleMessage | null;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;
    if (data.type === "settle:paid") {
      this.dispatchEvent(
        new CustomEvent("settle-paid", {
          detail: {
            request_id: data.request_id,
            receipt_hash: data.receipt_hash,
          },
        }),
      );
      this.closeModal("paid");
    } else if (data.type === "settle:error") {
      this.dispatchEvent(
        new CustomEvent("settle-error", {
          detail: { code: data.code, message: data.message },
        }),
      );
    } else if (data.type === "settle:closed") {
      this.closeModal("iframe_closed");
    }
  }
}

if (typeof window !== "undefined" && !customElements.get("settle-pay")) {
  customElements.define("settle-pay", SettlePayElement);
}

export { SettlePayElement };
