-- C40.2 — Auto-refill structural redesign for live firing.
--
-- Original 0028 schema was conceptually muddled: it referenced
-- `card_pubkey` as the refill target and `threshold_lamports` as a
-- daily-cap-remaining trigger. But on-chain cards don't HAVE a
-- "balance" — they have caps. The user-facing concept users actually
-- want is: "when my wallet's USDC drops below $X, transfer $Y from a
-- savings card to me automatically."
--
-- That maps cleanly to the spend_via_pact ix shape we already use:
--   - Source: a Pact under a savings card (delegated to relayer).
--   - Dest: a wallet pubkey (whose USDC ATA gets credited).
--   - Trigger: the dest's wallet USDC balance < threshold.
--
-- Adds:
--   pact_pubkey      — the Pact under card_pubkey the relayer spends through
--   dest_pubkey      — the wallet whose balance we monitor + refill INTO
-- Renames threshold_lamports → keeps the column but its semantic flips
-- from "card daily-cap remaining" to "destination wallet USDC balance."
--
-- Plus auto_refill_queue mirroring round_up_queue: phase5-tick polls
-- RPC, queues fires, signer drains.

alter table public.auto_refill_rules
    add column if not exists pact_pubkey text,
    add column if not exists dest_pubkey text;

create index if not exists auto_refill_rules_pact_idx
    on public.auto_refill_rules (pact_pubkey)
    where pact_pubkey is not null;
create index if not exists auto_refill_rules_dest_idx
    on public.auto_refill_rules (dest_pubkey)
    where dest_pubkey is not null;

create table if not exists public.auto_refill_queue (
    queue_id          uuid primary key default gen_random_uuid(),
    rule_id           uuid not null references public.auto_refill_rules(rule_id) on delete cascade,
    owner_pubkey      text not null,
    -- Snapshot of destination wallet USDC balance at the moment we
    -- decided to fire. Useful for "did the threshold actually trip?"
    -- audit and for "fire was unnecessary by the time it ran."
    observed_balance_lamports bigint not null,
    threshold_lamports bigint not null,
    refill_lamports   bigint not null,
    dest_pubkey       text not null,
    pact_pubkey       text not null,
    status            text not null default 'pending',
    signature         text,
    created_at        timestamptz not null default now(),
    fired_at          timestamptz,
    constraint auto_refill_queue_status_valid check (
        status in ('pending', 'fired', 'failed', 'skipped')
    ),
    constraint auto_refill_queue_amounts_pos check (
        threshold_lamports >= 0 and refill_lamports > 0
    )
);

create index if not exists auto_refill_queue_pending_idx
    on public.auto_refill_queue (status, created_at)
    where status = 'pending';
create index if not exists auto_refill_queue_owner_idx
    on public.auto_refill_queue (owner_pubkey, created_at desc);

comment on column public.auto_refill_rules.dest_pubkey is
    'C40.2 — the wallet whose USDC balance we monitor + refill INTO. NULL until set.';
comment on table public.auto_refill_queue is
    'C40.2 — phase5-tick enqueues when dest balance < threshold; signer drains.';
