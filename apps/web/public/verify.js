/* settle-verify — embeddable web component (F5.5)
 * v0.1 · Settle Protocol · MIT
 *
 * Drop into any HTML page:
 *   <script src="https://<host>/verify.js"></script>
 *   <settle-verify hash="<32-byte-hex>"></settle-verify>
 *
 * Or:
 *   <settle-verify receipt-id="<uuid>"></settle-verify>
 *
 * Optional:
 *   endpoint="https://settle.so" — point to a different host
 *   variant="compact" — single-line summary
 *
 * No framework required. Renders inside a shadow root for style isolation.
 * Network: one fetch to /api/verify/<hash> or /api/receipts/<uuid>.
 *
 * All DOM is built via createElement + textContent (no innerHTML), so any
 * receipt content the API returns is rendered as text — no script-injection
 * surface even if the upstream is compromised.
 */
(function () {
  if (typeof window === "undefined") return;
  if (window.customElements && window.customElements.get("settle-verify"))
    return;

  var STYLE = [
    ":host { display: block; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #f5f5f5; }",
    ".sv-card { border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: rgba(20,20,22,0.92); padding: 16px; }",
    ".sv-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }",
    ".sv-title { font-weight: 600; font-size: 14px; }",
    ".sv-tag { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); color: rgba(245,245,245,0.7); text-transform: uppercase; letter-spacing: 0.04em; }",
    ".sv-narration { margin-top: 12px; font-size: 13px; line-height: 1.5; color: rgba(245,245,245,0.85); }",
    ".sv-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 12px; }",
    ".sv-check { font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2px 0; }",
    ".sv-ok { color: #6ee7b7; }",
    ".sv-fail { color: #fca5a5; }",
    ".sv-pending { color: rgba(245,245,245,0.4); }",
    ".sv-meta { margin-top: 12px; font-size: 11px; color: rgba(245,245,245,0.5); display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; }",
    ".sv-meta b { font-weight: 500; color: rgba(245,245,245,0.7); }",
    ".sv-foot { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; font-size: 10px; color: rgba(245,245,245,0.4); }",
    ".sv-foot a { color: rgba(245,245,245,0.6); text-decoration: none; }",
    ".sv-foot a:hover { color: #f5f5f5; }",
    ".sv-loading { padding: 16px; font-size: 12px; color: rgba(245,245,245,0.4); text-align: center; }",
    ".sv-error { padding: 16px; font-size: 12px; color: #fca5a5; }",
    ".sv-compact { padding: 8px 12px; }",
    ".sv-compact .sv-narration, .sv-compact .sv-checks, .sv-compact .sv-meta, .sv-compact .sv-foot { display: none; }",
    "@media (prefers-color-scheme: light) {",
    "  :host { color: #0e0e10; }",
    "  .sv-card { background: rgba(255,255,255,0.95); border-color: rgba(0,0,0,0.08); }",
    "  .sv-tag { background: rgba(0,0,0,0.04); color: rgba(14,14,16,0.7); border-color: rgba(0,0,0,0.1); }",
    "  .sv-narration { color: rgba(14,14,16,0.85); }",
    "  .sv-meta b { color: rgba(14,14,16,0.7); }",
    "  .sv-foot { border-color: rgba(0,0,0,0.08); }",
    "}",
  ].join(" ");

  var HEX64 = /^[0-9a-f]{64}$/i;
  var UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function el(tag, props) {
    var n = document.createElement(tag);
    if (props) {
      if (props.className) n.className = props.className;
      if (props.text) n.textContent = props.text;
      if (props.href) n.setAttribute("href", props.href);
      if (props.target) n.setAttribute("target", props.target);
      if (props.rel) n.setAttribute("rel", props.rel);
    }
    return n;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmtUsdc(lamports) {
    var n = typeof lamports === "string" ? Number(lamports) : lamports;
    return (n / 1e6).toFixed(2);
  }

  function shortKey(k) {
    if (!k) return "";
    return k.slice(0, 6) + "…" + k.slice(-4);
  }

  class SettleVerifyEl extends HTMLElement {
    static get observedAttributes() {
      return ["hash", "receipt-id", "endpoint", "variant"];
    }

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      var styleEl = document.createElement("style");
      styleEl.textContent = STYLE;
      this._shadow.appendChild(styleEl);
      this._mount = document.createElement("div");
      this._shadow.appendChild(this._mount);
      this._fetched = false;
    }

    connectedCallback() {
      this._render();
      this._fetchOnce();
    }

    attributeChangedCallback() {
      this._fetched = false;
      this._render();
      this._fetchOnce();
    }

    _endpoint() {
      return this.getAttribute("endpoint") || "";
    }

    _isCompact() {
      return this.getAttribute("variant") === "compact";
    }

    _fetchOnce() {
      if (this._fetched) return;
      var hash = this.getAttribute("hash");
      var rid = this.getAttribute("receipt-id");
      if (!hash && !rid) return;
      this._fetched = true;

      var url;
      if (hash && HEX64.test(hash)) {
        url = this._endpoint() + "/api/verify/" + hash.toLowerCase();
      } else if (rid && UUID.test(rid)) {
        url = this._endpoint() + "/api/receipts/" + rid;
      } else {
        this._showError(
          "Invalid attribute: hash must be 32-byte hex or receipt-id must be a UUID.",
        );
        return;
      }

      var self = this;
      this._showLoading();
      fetch(url)
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          if (j && j.ok) self._showReceipt(j);
          else
            self._showError(
              (j && (j.message || j.error)) || "Receipt not found.",
            );
        })
        .catch(function (e) {
          self._showError("Network error: " + (e && e.message ? e.message : e));
        });
    }

    _render() {
      clearChildren(this._mount);
      var card = el("div", {
        className: "sv-card" + (this._isCompact() ? " sv-compact" : ""),
      });
      this._mount.appendChild(card);
      this._cardEl = card;
    }

    _showLoading() {
      clearChildren(this._cardEl);
      this._cardEl.appendChild(
        el("div", { className: "sv-loading", text: "Verifying receipt…" }),
      );
    }

    _showError(msg) {
      clearChildren(this._cardEl);
      this._cardEl.appendChild(el("div", { className: "sv-error", text: msg }));
    }

    _showReceipt(j) {
      var receipt = j.receipt || j;
      var hashes = receipt.hashes || {
        receipt_hash: receipt.receipt_hash,
        reason_hash: receipt.reason_hash,
        policy_snapshot_hash: receipt.policy_snapshot_hash,
        purpose_hash: receipt.purpose_hash,
        context_hash: receipt.context_hash,
      };
      var matchedOn = j.matched_on;
      var card = this._cardEl;
      clearChildren(card);

      // Header row
      var headerRow = el("div", { className: "sv-row" });
      headerRow.appendChild(
        el("span", {
          className: "sv-title",
          text:
            (receipt.decision === "ALLOW" ? "✓" : "✗") +
            " " +
            (receipt.decision || "ALLOW"),
        }),
      );
      if (receipt.receipt_kind) {
        headerRow.appendChild(
          el("span", { className: "sv-tag", text: receipt.receipt_kind }),
        );
      }
      card.appendChild(headerRow);

      // Narration (text only — no innerHTML, no XSS risk)
      if (receipt.narration_text) {
        card.appendChild(
          el("p", { className: "sv-narration", text: receipt.narration_text }),
        );
      }

      // Hash checks
      var checks = el("div", { className: "sv-checks" });
      ["receipt_hash", "reason_hash", "policy_snapshot_hash", "purpose_hash"].forEach(
        function (k) {
          var v = hashes[k];
          var ok = typeof v === "string" && HEX64.test(v);
          checks.appendChild(
            el("div", {
              className: "sv-check " + (ok ? "sv-ok" : "sv-pending"),
              text: (ok ? "✓ " : "○ ") + k,
            }),
          );
        },
      );
      card.appendChild(checks);

      // Meta
      var meta = el("div", { className: "sv-meta" });
      meta.appendChild(el("b", { text: "amount" }));
      meta.appendChild(
        el("span", { text: fmtUsdc(receipt.amount_lamports) + " USDC" }),
      );
      meta.appendChild(el("b", { text: "merchant" }));
      meta.appendChild(el("span", { text: shortKey(receipt.merchant_pubkey) }));
      if (matchedOn) {
        meta.appendChild(el("b", { text: "matched on" }));
        meta.appendChild(el("span", { text: matchedOn }));
      }
      if (receipt.created_at) {
        meta.appendChild(el("b", { text: "when" }));
        meta.appendChild(
          el("span", {
            text: new Date(receipt.created_at).toLocaleString(),
          }),
        );
      }
      card.appendChild(meta);

      // Foot
      var foot = el("div", { className: "sv-foot" });
      var hostBase = this._endpoint() || "";
      foot.appendChild(
        el("a", {
          href: hostBase + "/verify/" + (hashes.receipt_hash || ""),
          target: "_blank",
          rel: "noreferrer",
          text: "Open full proof →",
        }),
      );
      foot.appendChild(
        el("a", {
          href: "https://github.com/anthropics/settle-protocol",
          target: "_blank",
          rel: "noreferrer",
          text: "powered by Settle",
        }),
      );
      card.appendChild(foot);
    }
  }

  window.customElements.define("settle-verify", SettleVerifyEl);
})();
