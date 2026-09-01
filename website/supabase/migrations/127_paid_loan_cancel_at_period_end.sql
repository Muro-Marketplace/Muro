-- 127: record that a paid-loan subscription is winding down, so the product
--      stops telling a venue it will be charged again after they cancelled.
--
-- Rows 2179-2187 (production pass 2, 2026-08-31). A venue cancelled placement
-- p-1788192191293-7xdf. The page showed "Cancelled" at the top and, further
-- down, "Monthly payment active, £12.00/mo. Next payment on 30 September."
--
-- Stripe had been told. `cancelPaidLoanBilling` sends
-- `cancel_at_period_end: true`, and the row deliberately stays `active` until
-- the webhook confirms, because tearing it down early would cut short a period
-- the venue has already paid for. That part is right.
--
-- What was missing is any record that a cancellation was SCHEDULED. Every
-- reader saw `status = 'active'` with a future `current_period_end` and drew
-- the only conclusion available to it: healthy subscription, next payment on
-- that date. The date is in fact the last day of cover, and there is no next
-- payment.
--
-- NOT NULL DEFAULT false is safe: every existing row predates the column, and
-- for all of them "no cancellation is scheduled" is the truth. The one row that
-- IS winding down (c265b8f2-9224-4701-86e8-69f8f6805de2, the QA placement
-- above) is corrected below rather than left lying.

alter table public.placement_recurring_billings
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.placement_recurring_billings.cancel_at_period_end is
  'True once Stripe has been asked to end this subscription at the end of the '
  'current period. The row stays status=''active'' until the webhook confirms, '
  'so this is what distinguishes "running" from "winding down". Set only after '
  'the Stripe call succeeds: it is a claim about Stripe''s state, and writing it '
  'after a failed call would tell a venue they are not being charged when they '
  'still are.';

-- Backfill the one known winding-down row: its placement is cancelled, so its
-- subscription was asked to end. Scoped by the placement's own terminal status
-- rather than by id, so it is correct for any row in the same position.
update public.placement_recurring_billings b
set cancel_at_period_end = true
from public.placements p
where p.id = b.placement_id
  and b.status = 'active'
  and b.cancel_at_period_end = false
  and p.status in ('cancelled', 'completed', 'sold');
