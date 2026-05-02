/**
 * @settle/web-components — barrel export.
 *
 * Importing this file registers BOTH `<settle-pay>` and `<settle-verify>`.
 * For smaller bundles, import the side-effect entries individually:
 *   import "@settle/web-components/pay";
 *   import "@settle/web-components/verify";
 */
export { SettlePayElement } from "./pay.js";
export { SettleVerifyElement } from "./verify.js";
import "./pay.js";
import "./verify.js";
