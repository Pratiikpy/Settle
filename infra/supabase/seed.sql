-- Devnet demo seed — populates 5 verified merchants for the 90s demo flow.
-- Pubkeys are placeholders; replace with real devnet keypairs after `solana-keygen new`.

insert into public.verified_merchants (merchant_pubkey, domain, display_name, verification_method)
values
    ('ARXIVfetch1111111111111111111111111111111111', 'arxivfetch.demo', 'ArxivFetch',     'manual_devnet_seed'),
    ('TRANSlate1111111111111111111111111111111111', 'translateapi.demo', 'TranslateAPI', 'manual_devnet_seed'),
    ('SUMMary11111111111111111111111111111111111',  'summaryllm.demo', 'SummaryLLM',     'manual_devnet_seed'),
    ('SARAh111111111111111111111111111111111111',  'sarah.demo',       'Sarah (designer)','manual_devnet_seed'),
    ('AKIra11111111111111111111111111111111111',   'akira.demo',       'Akira (writer)', 'manual_devnet_seed')
on conflict (merchant_pubkey) do nothing;
