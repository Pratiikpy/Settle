-- Update seeded federation_origins with real attestation pubkeys.
--
-- Migration 0030 seeded 'x402.demo' and 'solana-pay.bridge' with the
-- placeholder pubkey "11111...". Now we set them to our actual
-- facilitator pubkey, which we hold the private key for, so we can
-- actually mint federation attestations. The `trusted` flag stays
-- false until the operator confirms the origin source.
--
-- Why update via migration vs admin script: this is part of the
-- federation contract — anyone reading the migration history sees
-- exactly which pubkey signs each origin. Mutating the row via an
-- ad-hoc UPDATE would leave the deployed schema and the migration
-- history out of sync.

update public.federation_origins
set attestation_pubkey = 'C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY',
    notes = 'Settle facilitator key signs attestations bridging Solana Pay reference txs. trusted=false until operator promotes.'
where origin_id = 'solana-pay.bridge';

-- x402.demo stays as the placeholder origin — this row exists so the
-- /api/federation/import endpoint has SOMETHING to reject in tests.
-- Operators can delete or update it as foreign x402 origins onboard.
