/**
 * Web Push helper — server-side, hand-rolled VAPID + RFC 8291 message encryption.
 *
 * Why hand-rolled instead of `web-push` npm: keeps the dep graph small and lets
 * this run on Vercel Node.js fluid compute (which doesn't ship libsodium). The
 * crypto is straightforward: one ECDH (P-256), HKDF, then AES-128-GCM.
 *
 * RFC 8291 (Message Encryption for Web Push) and RFC 8292 (VAPID).
 */

import { p256 } from "@noble/curves/p256";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { createCipheriv, randomBytes, createSign } from "node:crypto";

function b64urlToBytes(s: string): Uint8Array {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(Buffer.from(padded.replaceAll("-", "+").replaceAll("_", "/"), "base64"));
}
function bytesToB64url(b: Uint8Array | Buffer): string {
  return Buffer.from(b)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string; // mailto:... or https://...
}

function loadVapid(): VapidConfig | null {
  const pub = process.env.SETTLE_VAPID_PUBLIC_KEY;
  const priv = process.env.SETTLE_VAPID_PRIVATE_KEY;
  const sub = process.env.SETTLE_VAPID_SUBJECT;
  if (!pub || !priv || !sub) return null;
  return { publicKey: pub, privateKey: priv, subject: sub };
}

export function isWebPushConfigured(): boolean {
  return !!loadVapid();
}

export function getPublicVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.SETTLE_VAPID_PUBLIC_KEY ?? null;
}

/**
 * Build a VAPID JWT (ES256) and the matching `Authorization` header.
 */
function vapidAuthHeader(audience: string, vapid: VapidConfig): string {
  const header = bytesToB64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: vapid.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;

  // Sign with P-256 — convert raw 32-byte private to PEM via PKCS#8 wrap.
  // Easier: use @noble/curves p256.sign which returns r||s (jose-compatible).
  const privBytes = b64urlToBytes(vapid.privateKey);
  const sig = p256.sign(sha256(new TextEncoder().encode(signingInput)), privBytes, {
    prehash: false,
  });
  const sigBytes = sig.toCompactRawBytes(); // r||s, 64 bytes — exactly JWT ES256 expects
  const jwt = `${signingInput}.${bytesToB64url(sigBytes)}`;

  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string; // base64url, recipient public key (65 bytes uncompressed)
  auth: string; // base64url, 16 random bytes shared with the SW
}

/**
 * Encrypt + send a push payload per RFC 8291 (aes128gcm content-encoding).
 * Returns the upstream HTTP status (201 = accepted).
 */
export async function sendPush(sub: PushSubscription, payload: object): Promise<number> {
  const vapid = loadVapid();
  if (!vapid) return 0; // silently no-op if unconfigured

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  if (plaintext.length > 4000) {
    throw new Error(`push payload too large: ${plaintext.length}`);
  }

  // 1. Generate ephemeral P-256 keypair.
  const ephPriv = p256.utils.randomPrivateKey();
  const ephPub = p256.getPublicKey(ephPriv, false); // uncompressed 65 bytes

  // 2. ECDH shared secret with the subscriber's public key.
  const subPub = b64urlToBytes(sub.p256dh);
  const ikm0 = p256.getSharedSecret(ephPriv, subPub).slice(1); // strip 0x04 prefix → 32 bytes

  // 3. RFC 8291 IKM = HKDF-Expand(HKDF-Extract(authSecret, ikm0), keyInfo, 32)
  //    where keyInfo = "WebPush: info\x00" || ua_pubkey || as_pubkey
  const authSecret = b64urlToBytes(sub.auth);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    Buffer.from(subPub),
    Buffer.from(ephPub),
  ]);
  const ikm = hkdf(sha256, ikm0, authSecret, keyInfo, 32);

  // 4. Salt is 16 random bytes; CEK = HKDF(ikm, salt, "Content-Encoding: aes128gcm\x00", 16)
  const salt = randomBytes(16);
  const cek = hkdf(sha256, ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdf(sha256, ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  // 5. Pad: append 0x02 (last record marker) and zero-pad to a fixed record size.
  //    Spec allows variable padding; we use payload + 0x02 with no extra zeros.
  const padded = Buffer.concat([Buffer.from(plaintext), Buffer.from([0x02])]);

  // 6. AES-128-GCM encrypt.
  const cipher = createCipheriv("aes-128-gcm", Buffer.from(cek), Buffer.from(nonce));
  const ct = Buffer.concat([cipher.update(padded), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encrypted = Buffer.concat([ct, tag]);

  // 7. Build aes128gcm content body: salt(16) || rs(4 BE) || idlen(1) || keyid || ciphertext
  //    keyid is the 65-byte ephemeral public key.
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const body = Buffer.concat([
    Buffer.from(salt),
    rs,
    Buffer.from([ephPub.length]),
    Buffer.from(ephPub),
    encrypted,
  ]);

  // 8. POST to the endpoint with VAPID Authorization.
  const u = new URL(sub.endpoint);
  const audience = `${u.protocol}//${u.host}`;
  const auth = vapidAuthHeader(audience, vapid);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Content-Length": String(body.length),
      TTL: "86400",
      Urgency: "normal",
      Authorization: auth,
    },
    body: body as unknown as ArrayBuffer,
  });

  void createSign; // no-op silence-unused warning if linters complain
  return res.status;
}

/**
 * Convenience: fetch every subscription for a pubkey + send them the same payload.
 * Returns count of successful (status 201/200/202) deliveries.
 */
export async function sendPushToPubkey(
  pubkey: string,
  payload: { title: string; body: string; url?: string; icon?: string },
): Promise<{ sent: number; failed: number }> {
  if (!isWebPushConfigured()) return { sent: 0, failed: 0 };

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return { sent: 0, failed: 0 };

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("pubkey", pubkey);

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const status = await sendPush(sub as PushSubscription, payload);
        if (status >= 200 && status < 300) {
          sent += 1;
          await supabase
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString(), failed_count: 0 })
            .eq("endpoint", sub.endpoint);
        } else {
          failed += 1;
          // 404/410 = subscription gone; delete it.
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      } catch {
        failed += 1;
      }
    }),
  );

  return { sent, failed };
}
