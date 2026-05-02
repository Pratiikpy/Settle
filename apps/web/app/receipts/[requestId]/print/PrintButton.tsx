"use client";

/**
 * Tiny client component just for the print trigger. The rest of the
 * page is fully server-rendered so search engines + screen readers
 * see the receipt without running JS.
 */
export function PrintButton() {
  return (
    <button
      className="print-button no-print"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      Save as PDF
    </button>
  );
}
