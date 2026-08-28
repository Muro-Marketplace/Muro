-- 115: make the referral reward real (owner decision 10, D17.2 answered;
--      04 item 5.3 / D14 with it).
--
-- The referral programme promises the referrer 30 fee-free days when someone
-- they referred first pays. Two halves were broken; migration 109 fixed the
-- first (the code was destroyed on application). This is the second:
-- `artist_profiles.free_until`, the column the webhook credit writes and the
-- fee logic once read, HAS NEVER EXISTED. The credit's select was rejected
-- whole by PostgREST, `referrer` came back null, and the credit was skipped —
-- the parked floor of the phantom-column ratchet, held open by D17.2's
-- question: where should a free window live, given `trial_end` is
-- Stripe-managed?
--
-- The answer is a real `free_until`, for the reason D17.2 itself gives:
-- `trial_end` belongs to Stripe. The webhook overwrites it from the
-- subscription object on every update, so a reward written there would survive
-- only until the next `customer.subscription.updated`. A platform-owned reward
-- needs a platform-owned column.
--
-- `extend_free_until` is the D14 half. The old credit was read-modify-write
-- across two statements on two rows: read referrer.free_until, compute, write
-- it, then stamp referred.referral_credited_at. Stripe redelivers events and
-- runs handlers concurrently, so two deliveries could both read the same base
-- and one 30-day credit could land twice (or the stamp land without the
-- credit). One function, one transaction:
--
--   * the stamp is the GUARD: the referred row's referral_credited_at is
--     claimed first with `WHERE referral_credited_at IS NULL`, so a concurrent
--     redelivery finds 0 rows and stops;
--   * the extension bases on GREATEST(now, free_until) inside the same
--     statement, so stacked credits from different referred artists chain
--     rather than overwrite.
--
-- Returns whether it credited, so the caller can log without re-reading.

ALTER TABLE public.artist_profiles
  ADD COLUMN IF NOT EXISTS free_until TIMESTAMPTZ;

COMMENT ON COLUMN public.artist_profiles.free_until IS
  'Platform-owned fee-free window (referral rewards). While in the future, '
  'platformFeePercentForArtist charges 0% on an otherwise active subscription. '
  'Distinct from trial_end, which Stripe owns and overwrites.';

CREATE OR REPLACE FUNCTION public.extend_free_until(
  p_referred_id UUID,
  p_days        INTEGER
) RETURNS TABLE(credited BOOLEAN, referrer_id UUID, new_free_until TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code     TEXT;
  v_referrer UUID;
  v_until    TIMESTAMPTZ;
BEGIN
  -- Claim the credit. This is the idempotency guard: a redelivery, or a
  -- concurrent duplicate, updates 0 rows here and returns uncredited.
  UPDATE artist_profiles
     SET referral_credited_at = now()
   WHERE id = p_referred_id
     AND referred_by_code IS NOT NULL
     AND referral_credited_at IS NULL
  RETURNING referred_by_code INTO v_code;

  IF v_code IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  UPDATE artist_profiles
     SET free_until = GREATEST(COALESCE(free_until, now()), now()) + make_interval(days => p_days)
   WHERE referral_code = v_code
  RETURNING id, free_until INTO v_referrer, v_until;

  -- No referrer holds that code: roll the claim back so a later fix can
  -- re-credit, rather than burning the referred artist's one credit on a
  -- dangling code.
  IF v_referrer IS NULL THEN
    RAISE EXCEPTION 'extend_free_until: no artist holds referral code %', v_code;
  END IF;

  RETURN QUERY SELECT TRUE, v_referrer, v_until;
END;
$$;

-- Same SECURITY DEFINER lockdown as 085/087/104: Supabase grants EXECUTE to
-- anon and authenticated explicitly, and this function moves an entitlement.
REVOKE ALL ON FUNCTION public.extend_free_until(UUID, INTEGER)
  FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
