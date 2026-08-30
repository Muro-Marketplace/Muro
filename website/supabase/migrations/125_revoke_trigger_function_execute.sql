-- Trigger functions do not need EXECUTE granted to API roles.
--
-- Supabase's security linter flagged `placements_freeze_created_by` (added by
-- migration 122) as a SECURITY DEFINER function callable by `anon` and
-- `authenticated` through /rest/v1/rpc/. Calling a trigger function directly
-- raises an error, because plpgsql has no NEW/OLD/TG_OP outside a trigger
-- context, so this was never exploitable. It is still a grant that buys
-- nothing, and the DEFINER one is the shape that becomes dangerous the moment
-- somebody edits the body.
--
-- Firing a trigger does NOT check the invoking user's EXECUTE privilege on the
-- trigger function, so revoking here cannot stop any trigger working. The five
-- non-DEFINER siblings are included to close the class rather than the single
-- flagged instance.
--
-- Verified live after applying: all six revoked, the placements trigger still
-- fires, and the linter warning clears.

REVOKE EXECUTE ON FUNCTION public.placements_freeze_created_by() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.blogs_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_set_order_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.placement_recurring_billings_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wall_layouts_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.walls_set_updated_at() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
