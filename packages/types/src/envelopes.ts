/**
 * AgentCredential envelope — `settle://...` URI.
 * NOT a bearer token. Per N19 dual-signature lock:
 *   - Envelope is signed by the AgentCard authority at issuance (long-lived sig).
 *   - Each request additionally carries a fresh per-request agent_sig over (envelope_hash || request_payload).
 */
export interface AgentCredentialEnvelope {
  v: 1;
  /** AgentCard PDA */
  card: string;
  /** Agent pubkey (does NOT hold a wallet — it signs payloads only) */
  agent_pubkey: string;
  /** ISO 8601 expiry */
  expires_at: string;
  /** Capability allowlist hashes (mirrors on-chain pin) */
  capabilities: string[];
  /** Authority signature over canonical JSON of this envelope (Ed25519, base58) */
  authority_sig: string;
}

/**
 * Per-request payload signed by the agent. The HTTP context (target_method/target_path)
 * is bound into the receipt's `purpose_hash` (binding meta-commitment) so that a receipt
 * cannot be replayed against a different endpoint with the same envelope.
 */
export interface AgentRequestPayload {
  envelope_hash: string;       // BLAKE3 of envelope JSON
  request_id: string;          // UUID v4
  merchant: string;            // pubkey (base58)
  capability_hash: string;     // 32-byte BLAKE3 hex
  amount_lamports: string;     // USDC base units (decimal string)
  nonce: string;               // 16 bytes hex; checked in Upstash
  ts_unix: number;
  /** Target HTTP method the agent intends to invoke after payment is approved. */
  target_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Target HTTP path on the merchant. Must start with "/". */
  target_path: string;
  agent_sig: string;           // Ed25519 over canonical (envelope_hash || rest), base58
}
