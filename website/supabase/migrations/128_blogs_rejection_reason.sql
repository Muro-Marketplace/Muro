-- 128: keep the blog rejection reason where the author can read it.
--
-- Pass 2 item 3.2 (row 2442). The admin prompt says "Reason (emailed to the
-- author):" and the reason was written to `admin_audit_log` and to the
-- `moderation_queue` row, neither of which an artist can see. The artist's own
-- portal showed a bare "Rejected" badge with no explanation.
--
-- The one route out was the email, and on the occasion pass 2 tested it was
-- eaten by the send throttle (item 3.1), so the reason reached the author by no
-- route at all. Two independent fixes for that: the throttle no longer drops
-- the first send of a template, and the reason now lives on the blog.
--
-- Nullable: it means "no reason recorded", which is the truth for every blog
-- rejected before this column existed, and for one rejected without a reason
-- (the admin prompt allows cancelling out of it).

alter table public.blogs
  add column if not exists rejection_reason text;

comment on column public.blogs.rejection_reason is
  'Why an admin rejected this post, shown to the author on their own blog list. '
  'Written on the reject transition and cleared when the post is resubmitted, so '
  'a stale reason cannot sit beside a pending post. NULL means no reason was '
  'recorded, which is not the same as no rejection.';
