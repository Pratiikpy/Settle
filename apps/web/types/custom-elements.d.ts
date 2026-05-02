/**
 * Type declarations for Settle's embeddable custom elements.
 * Lets TSX render `<settle-verify>` without `@ts-expect-error`.
 */
import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "settle-verify": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        hash?: string;
        "receipt-id"?: string;
        endpoint?: string;
        variant?: "compact" | "full";
      };
      "settle-pay": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        merchant: string;
        amount: string;
        note?: string;
        endpoint?: string;
        label?: string;
      };
    }
  }
}

export {};
