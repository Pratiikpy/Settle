/* settle-pay — embeddable pay button (F5.4)
 * v0.1 · Settle Protocol · MIT
 *
 * Drop into any HTML page:
 *   <script src="https://<host>/pay.js"></script>
 *   <settle-pay
 *     merchant="<base58-pubkey>"
 *     amount="0.50"
 *     note="Optional invoice text"
 *   ></settle-pay>
 *
 * Optional attributes:
 *   endpoint="https://settle.so" — popup origin (default: same as script src)
 *   label="Pay $0.50 with Settle"  — button text override
 *
 * Events fired on the element after payment:
 *   "settle:success"   detail: { signature, request_id, amount_usdc, recipient }
 *   "settle:error"     detail: { message }
 *   "settle:cancel"    detail: {}
 *
 * Listen with:
 *   document.querySelector("settle-pay")
 *     .addEventListener("settle:success", (e) => console.log(e.detail));
 *
 * No framework required. The element opens a popup to /pay/widget and
 * receives the result via postMessage. All DOM is built via createElement
 * + textContent to avoid any innerHTML / XSS surface.
 */
(function () {
  if (typeof window === "undefined") return;
  if (window.customElements && window.customElements.get("settle-pay")) return;

  // Auto-detect the script's origin so settle-pay opens the popup on the
  // same host that served pay.js, unless the host overrides via attribute.
  function defaultEndpoint() {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      var match = src.match(/^(https?:\/\/[^/]+)\/pay\.js(?:\?|$)/);
      if (match) return match[1];
    }
    return window.location.origin;
  }

  var STYLE = [
    ":host { display: inline-block; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }",
    "button.sp { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 999px; background: linear-gradient(135deg, #14F195 0%, #9b6cff 100%); color: #0a0a0a; font-weight: 600; font-size: 14px; border: none; cursor: pointer; transition: opacity 0.15s; }",
    "button.sp:hover:not(:disabled) { opacity: 0.92; }",
    "button.sp:active:not(:disabled) { transform: translateY(1px); }",
    "button.sp:disabled { opacity: 0.6; cursor: progress; }",
    "button.sp .sp-mark { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; opacity: 0.55; padding-left: 8px; border-left: 1px solid rgba(0,0,0,0.2); }",
    ".sp-status { display: inline-block; margin-left: 8px; font-size: 11px; color: #888; }",
    ".sp-status.ok { color: #14F195; }",
    ".sp-status.err { color: #ff6b6b; }",
  ].join(" ");

  function el(tag, props) {
    var n = document.createElement(tag);
    if (props) {
      if (props.className) n.className = props.className;
      if (props.text) n.textContent = props.text;
      if (props.type) n.setAttribute("type", props.type);
    }
    return n;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  class SettlePayEl extends HTMLElement {
    static get observedAttributes() {
      return ["merchant", "amount", "note", "endpoint", "label"];
    }

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      var style = document.createElement("style");
      style.textContent = STYLE;
      this._shadow.appendChild(style);
      this._mount = document.createElement("div");
      this._shadow.appendChild(this._mount);
      this._messageListener = null;
      this._popup = null;
    }

    connectedCallback() {
      this._render();
    }

    attributeChangedCallback() {
      this._render();
    }

    disconnectedCallback() {
      if (this._messageListener) {
        window.removeEventListener("message", this._messageListener);
        this._messageListener = null;
      }
    }

    _endpoint() {
      return this.getAttribute("endpoint") || defaultEndpoint();
    }

    _render() {
      clearChildren(this._mount);
      var merchant = this.getAttribute("merchant");
      var amount = this.getAttribute("amount");
      if (!merchant || !amount) {
        var err = el("div", {
          className: "sp-status err",
          text: "settle-pay: missing merchant or amount attribute",
        });
        this._mount.appendChild(err);
        return;
      }
      var label =
        this.getAttribute("label") ||
        "Pay $" + amount + " with Settle";

      var btn = el("button", { className: "sp", type: "button" });
      btn.appendChild(el("span", { text: label }));
      btn.appendChild(el("span", { className: "sp-mark", text: "settle" }));

      var status = el("span", { className: "sp-status" });

      var self = this;
      btn.addEventListener("click", function () {
        self._openPopup(merchant, amount, btn, status);
      });

      this._mount.appendChild(btn);
      this._mount.appendChild(status);
    }

    _openPopup(merchant, amount, btn, status) {
      var note = this.getAttribute("note") || "";
      var endpoint = this._endpoint();
      var url =
        endpoint +
        "/pay/widget" +
        "?merchant=" + encodeURIComponent(merchant) +
        "&amount=" + encodeURIComponent(amount) +
        "&note=" + encodeURIComponent(note) +
        "&origin=" + encodeURIComponent(window.location.origin);

      // 460x720 fits Phantom's modal + the popup's own UI. Center on screen.
      var w = 460, h = 720;
      var l = Math.max(0, Math.round((window.outerWidth - w) / 2 + (window.screenX || 0)));
      var t = Math.max(0, Math.round((window.outerHeight - h) / 2 + (window.screenY || 0)));
      this._popup = window.open(
        url,
        "settle-pay",
        "width=" + w + ",height=" + h + ",left=" + l + ",top=" + t + ",resizable=yes,scrollbars=yes",
      );
      if (!this._popup) {
        status.className = "sp-status err";
        status.textContent = "popup blocked";
        return;
      }

      btn.disabled = true;
      status.className = "sp-status";
      status.textContent = "waiting…";

      var self = this;
      // Remove any stale listener.
      if (this._messageListener) {
        window.removeEventListener("message", this._messageListener);
      }
      this._messageListener = function (event) {
        // Trust origin — only accept from our endpoint.
        try {
          var origin = new URL(endpoint).origin;
          if (event.origin !== origin) return;
        } catch (e) {
          return;
        }
        var data = event.data;
        if (!data || typeof data.type !== "string") return;

        if (data.type === "settle:payment-success") {
          status.className = "sp-status ok";
          status.textContent = "paid ✓";
          btn.disabled = false;
          self.dispatchEvent(
            new CustomEvent("settle:success", {
              detail: {
                signature: data.signature,
                request_id: data.request_id,
                amount_usdc: data.amount_usdc,
                recipient: data.recipient,
              },
            }),
          );
        } else if (data.type === "settle:payment-error") {
          status.className = "sp-status err";
          status.textContent = "failed";
          btn.disabled = false;
          self.dispatchEvent(
            new CustomEvent("settle:error", {
              detail: { message: data.message || "payment_failed" },
            }),
          );
        } else if (data.type === "settle:payment-cancelled") {
          status.className = "sp-status";
          status.textContent = "cancelled";
          btn.disabled = false;
          self.dispatchEvent(new CustomEvent("settle:cancel", { detail: {} }));
        }
      };
      window.addEventListener("message", this._messageListener);
    }
  }

  window.customElements.define("settle-pay", SettlePayEl);
})();
