-- Privacy toggle column on receipts.
-- Default false (private) — only ALLOW receipts with public_feed=true appear in /api/feed.
-- Owner can toggle per-receipt or per-card.

alter table public.receipts
    add column if not exists public_feed boolean not null default false;

create index if not exists receipts_public_feed_idx
    on public.receipts (public_feed, created_at desc)
    where public_feed = true;

-- Card-level default override
alter table public.agent_cards
    add column if not exists public_feed_default boolean not null default false;

-- Auto-set receipts.public_feed from card's default when inserting
create or replace function public.set_receipt_public_feed()
returns trigger language plpgsql as $$
begin
    if new.public_feed is null or new.public_feed = false then
        select public_feed_default into new.public_feed
        from public.agent_cards
        where card_pubkey = new.card_pubkey;
        new.public_feed := coalesce(new.public_feed, false);
    end if;
    return new;
end;
$$;

drop trigger if exists receipts_set_public_feed on public.receipts;
create trigger receipts_set_public_feed
    before insert on public.receipts
    for each row execute function public.set_receipt_public_feed();
