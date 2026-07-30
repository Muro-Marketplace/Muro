-- 081_artist_international_shipping.sql
--
-- G-C / Bug 10: the delivery country was never validated against the artist's
-- shipping scope, and the scope itself could not be stored anywhere.
--
-- artist-profiles-transform.ts:147-148 reads ships_internationally and
-- international_shipping_price, api/artist-profile validated them, and the
-- artist portal's "Ships internationally" toggle PUTs both. Neither column
-- existed in any migration or in the live table, so:
--
--   * the toggle was decorative. writable-fields.ts deliberately omitted both
--     names because allowlisting a phantom column makes PostgREST reject the
--     whole UPDATE, so every save silently dropped the artist's answer.
--   * shipsInternationally was therefore false for every artist, which is why
--     EVERY artwork page rendered "Ships to UK only".
--   * api/checkout checked the country only against the platform-wide supported
--     list, never against the artist's scope, so a buyer could pay for delivery
--     to a country the artist had never agreed to ship to, contradicting the
--     page they bought it from.
--
-- This adds the storage so the scope is real and per-artist, which is what the
-- rest of the code was already written against. The defaults preserve today's
-- visible behaviour exactly: false means UK only, which is what every artwork
-- page already claims.
--
-- Safe on live data: ADD COLUMN with a default on a NOT NULL boolean, plus one
-- nullable numeric, rewrites no existing value and cannot invalidate a row.
-- Verified before applying that artist_profiles carries neither column name, so
-- there is nothing to collide with. Types mirror the columns they sit beside:
-- offers_pickup (boolean not null default false) and default_shipping_price
-- (numeric, nullable).
--
-- Idempotent: both statements use IF NOT EXISTS.

alter table public.artist_profiles
  add column if not exists ships_internationally boolean not null default false;

alter table public.artist_profiles
  add column if not exists international_shipping_price numeric;

comment on column public.artist_profiles.ships_internationally is
  'Artist will ship outside the UK. false (the default) means UK only, which api/checkout enforces against the delivery country before minting a Stripe session (G-C / Bug 10).';

comment on column public.artist_profiles.international_shipping_price is
  'Optional flat per-item price for non-UK delivery. NULL falls back to the calculated international tier. Only meaningful when ships_internationally is true.';
