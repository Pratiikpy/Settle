# @settle/web-components

Vanilla web components for embedding Settle into any HTML page.

## Install

```bash
npm install @settle/web-components
```

Or load via script tag (auto-registers):

```html
<script type="module" src="https://settle.so/pay.js"></script>
<script type="module" src="https://settle.so/verify.js"></script>
```

## `<settle-pay>`

Embeddable pay button — opens a hosted iframe so the user's wallet stays at settle.so.

```html
<settle-pay
  merchant="HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD"
  amount="0.50"
  note="Order #1234"
></settle-pay>

<script>
  document.querySelector("settle-pay").addEventListener("settle-paid", (e) => {
    console.log("paid:", e.detail.request_id, e.detail.receipt_hash);
  });
</script>
```

### Attributes

| Attribute    | Required | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| `merchant`   | yes      | base58 pubkey of the receiving merchant          |
| `amount`     | yes      | USDC decimal string (e.g. `"0.50"`)              |
| `note`       | no       | optional label shown in the modal                |
| `capability` | no       | capability_hash hex — pins payment to a spec     |
| `endpoint`   | no       | override iframe origin (default settle.so)       |
| `label`      | no       | override button text                             |

### Events

| Event           | Detail                                  |
| --------------- | --------------------------------------- |
| `settle-paid`   | `{ request_id, receipt_hash }`          |
| `settle-error`  | `{ code, message }`                     |
| `settle-closed` | `{}`                                    |

## `<settle-verify>`

Client-side receipt verifier — recomputes BLAKE3 hashes locally and compares them with the on-chain values fetched from settle.so. No trust required: every check runs in the user's browser.

```html
<settle-verify request-id="2c4e1f9b-8d…"></settle-verify>
```

Or look up by receipt hash:

```html
<settle-verify receipt-hash="a1b2c3d4…"></settle-verify>
```

### Attributes

| Attribute      | Required | Description                                |
| -------------- | -------- | ------------------------------------------ |
| `request-id`   | one of   | receipt request_id (UUID)                  |
| `receipt-hash` | one of   | 32-byte hex                                |
| `endpoint`     | no       | override API origin (default settle.so)    |

The badge shows PASS only when all four canonical-payload re-hashes match the on-chain commitments. If the API doesn't expose the canonical payloads (production default), the badge shows the receipt as found-but-unverifiable so users can request canonicals via `?include=canonical`.

## License

MIT
