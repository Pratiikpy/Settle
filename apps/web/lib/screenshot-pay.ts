"use client";

/**
 * F19 — Screenshot tap-to-pay.
 *
 * Drop an image (or paste from clipboard, or pick from device) → we decode any QR
 * inside it client-side via jsQR, then parse it as a Solana Pay URL via @solana/pay's
 * parseURL. The send page wires this so a user can pay from a screenshot without
 * typing anything.
 *
 * Browser flow only. Server-side parse is a follow-up (would shell out to a native
 * QR decoder for images jsQR can't read — usually low-contrast camera shots).
 *
 * Returns:
 *   { ok: true, kind: "transfer" | "transaction", parsed: ParsedURL }
 *   { ok: false, reason: "no_qr" | "not_solana_pay" | "decode_failed", message }
 */

import jsQR from "jsqr";
import { parseURL } from "@solana/pay";

export interface ScreenshotParseResult {
  /** Raw QR string. */
  raw: string;
  /** Parsed Solana Pay URL (transfer-request or transaction-request). */
  parsed: ReturnType<typeof parseURL>;
  /** Image dimensions of the source we decoded. Useful for debugging. */
  width: number;
  height: number;
}

export type ScreenshotParseOutcome =
  | { ok: true; result: ScreenshotParseResult }
  | { ok: false; reason: "no_qr" | "not_solana_pay" | "decode_failed"; message: string };

/**
 * Render a Blob/File into an OffscreenCanvas (or HTMLCanvasElement fallback) to extract
 * pixel data, then run jsQR over it.
 */
async function decodeQrFromBlob(
  blob: Blob,
): Promise<{ data: string; width: number; height: number } | null> {
  // Use createImageBitmap for fast decode without a hidden <img>.
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;

  let imgData: ImageData | null = null;
  if (typeof OffscreenCanvas !== "undefined") {
    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    imgData = ctx.getImageData(0, 0, width, height);
  } else {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    imgData = ctx.getImageData(0, 0, width, height);
  }

  bitmap.close?.();
  if (!imgData) return null;

  const code = jsQR(imgData.data, width, height);
  if (!code) return null;
  return { data: code.data, width, height };
}

/** Try to decode a QR + parse it as a Solana Pay URL. */
export async function parseScreenshotToSolanaPay(
  file: File | Blob,
): Promise<ScreenshotParseOutcome> {
  try {
    const decoded = await decodeQrFromBlob(file);
    if (!decoded) {
      return { ok: false, reason: "no_qr", message: "No QR code found in image." };
    }
    let parsed: ReturnType<typeof parseURL>;
    try {
      parsed = parseURL(decoded.data);
    } catch (e) {
      return {
        ok: false,
        reason: "not_solana_pay",
        message: `QR decoded but isn't a Solana Pay URL: ${(e as Error).message}`,
      };
    }
    return {
      ok: true,
      result: {
        raw: decoded.data,
        parsed,
        width: decoded.width,
        height: decoded.height,
      },
    };
  } catch (e) {
    return {
      ok: false,
      reason: "decode_failed",
      message: (e as Error).message,
    };
  }
}

/**
 * Helper: convert a paste event's clipboard items to a single Blob, if the user
 * pasted an image. Returns null if no image found.
 */
export function blobFromClipboard(e: ClipboardEvent): Blob | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it && it.type.startsWith("image/")) {
      const blob = it.getAsFile();
      if (blob) return blob;
    }
  }
  return null;
}
