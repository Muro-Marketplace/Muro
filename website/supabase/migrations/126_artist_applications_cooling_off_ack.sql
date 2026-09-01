-- 126: keep the cooling-off acknowledgement the application form already
--      requires, instead of discarding it.
--
-- `ApplicationForm` shows a consumer applicant a tick box reading "I
-- acknowledge that I have been informed of my 14-day right to cancel", and
-- refuses to enable Submit until it is ticked (the check is
-- `traderStatus === "consumer" && !acknowledgedCoolingOff`). The form sends
-- `acknowledgedCoolingOff` to /api/apply.
--
-- `applySchema` never declared the field. Zod strips unknown keys, so the
-- value was discarded at the validation boundary and no writer ever saw it.
-- The result: every consumer artist is required to attest to something under
-- the Consumer Contracts (Information, Cancellation and Additional Charges)
-- Regulations 2013, and we hold no evidence that any of them did.
--
-- Two columns, because the regulation cares about when the information was
-- given as much as that it was. Both nullable: 17 existing applications were
-- taken before this column existed and there is no honest value to backfill.
-- NULL means "we did not record it", which is the truth. It must not be
-- confused with false, which would assert the applicant declined.

alter table public.artist_applications
  add column if not exists acknowledged_cooling_off boolean,
  add column if not exists acknowledged_cooling_off_at timestamptz;

comment on column public.artist_applications.acknowledged_cooling_off is
  'Consumer applicant confirmed they were informed of the statutory cancellation right. NULL means not recorded (pre-migration-126 rows), which is not the same as false.';

comment on column public.artist_applications.acknowledged_cooling_off_at is
  'When the acknowledgement above was captured. NULL whenever acknowledged_cooling_off is NULL.';
