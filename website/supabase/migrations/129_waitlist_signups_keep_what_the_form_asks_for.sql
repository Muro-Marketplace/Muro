-- 129: keep the three waitlist fields the form asks for and then discards.
--
-- Row A L364. /waitlist posts name, email, phone, userType, venueName and
-- venueLocation. `waitlistSchema` declares only name, email and userType, so
-- zod strips the other three at the validation boundary and no writer ever sees
-- them; `waitlist_signups` has no column for them either. A venue joining the
-- waiting list is asked for their venue's name and where it is, and we keep
-- neither, so the list cannot be worked: there is no way to tell a venue in
-- Hampton from one in Leeds, or to ring anybody.
--
-- The remedy the plan recommends is to add the columns rather than remove the
-- inputs, because all three are asked for deliberately and are the only thing
-- that makes the list actionable.
--
-- All nullable: 3 existing rows predate the columns and there is no honest
-- value to backfill. NULL means "we did not record it", which is the truth.

alter table public.waitlist_signups
  add column if not exists phone text,
  add column if not exists venue_name text,
  add column if not exists venue_location text;

comment on column public.waitlist_signups.phone is
  'Optional phone the waitlist form asks for. NULL on rows taken before migration 129, and on anyone who left it blank.';
comment on column public.waitlist_signups.venue_name is
  'Venue name, asked for only when the signup is a venue. NULL for artists and for rows taken before migration 129.';
comment on column public.waitlist_signups.venue_location is
  'Where the venue is, asked for only when the signup is a venue. NULL for artists and for rows taken before migration 129.';
