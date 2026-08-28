# Launch triage of the functionality-inventory flags, 2026-08-28

Every FLAG row in the 2026-08-28 MVP functionality inventory was independently
re-verified against the source code and scored against a launch-gate rubric,
then the ratings were stress-tested twice: a sceptic pass tried to demote every
claimed blocker, and an advocate pass tried to rescue anything dismissed. 59
ratings changed under challenge; the tables below show the final position.

Verdict on the inventory itself: of 300 scored flags, 292 were confirmed
against the code, 8 were real but overstated, and 0 were refuted.

| Final severity | Count | Meaning |
|---|---|---|
| P0 | 3 | Launch gate: do not launch without fixing |
| P1 | 38 | Fix before launch if at all possible |
| P2 | 168 | Fix soon after launch |
| P3 | 91 | Accept for now |

Effort across P0+P1: M=9, S=32.

## Fix round status, 2026-08-28

Every P0 and every P1 below is FIXED on this branch (commits 9b28c30, 3860922,
814829a, a1d8411, edf6252), each with regression tests; the full gate passed
at 2,706 tests, 0 lint errors. Product decisions taken during the round:
customers and guests enquire via /api/enquiry rather than a rushed customer
messaging build (the dead funnels are removed and the customer Messages page
says so honestly); the unsubscribe page is confirm-first so link scanners
cannot unsubscribe readers; four of the seven grandfathered refund handlers
migrated to mutate() as the substance of C5/C6/D18/D19 (server-side money
gating untouched, ratchet floor lowered 7 to 3 per its contract). Bonus
defects fixed en route: the hard-delete list carried the N3 phantom column,
the message options popup's archive posted to a route with no DELETE handler,
and the dispute-resolved email shared the dispute-opened email's dead link.

## P0: the launch gate

| Ref | Problem | Effort | Fix |
|---|---|---|---|
| A8 | Three fabricated named testimonials with invented sales outcomes presented as genuine. page.tsx:363-386: source comment admits names/roles are placeholders, yet quotes claim specific sales ('four sales straight off the wall this quarter'). Fake consumer testimonials are a banned practice under UK consumer law. | S | Remove the testimonials section, or clearly label it illustrative, before launch. |
| C24 | Visible unsubscribe link in every notify/news email always fails. EmailShell.tsx builds /account/email/unsubscribe?c={category} with no u; the page (lines 57-59) requires both c and u, so the primary human unsubscribe path can never succeed. PECR/GDPR working-unsubscribe issue. | S | Thread the recipient's user id (or a signed token) into EmailShell and append it to the link. |
| D16 | Labels page never sets venueSlug, breaking venue QR revenue-share attribution. labels/page.tsx:161-199 sets only venueName (names fetched at 110-118); LabelSheet.tsx:83 emits vs only from venueSlug; qr/[slug]/route.ts resolves venue_user_id, redirect venue param and signed va only from vs, so venue share silently zeroes. | M | Thread venue_slug from /api/placements through the dropdown, buildLabels, and the placements deep link. |

## P1: fix before launch if at all possible

| Ref | Area | Problem | Effort | Fix |
|---|---|---|---|---|
| A20 | Public/auth | 'Browse hundreds of storefronts' overstates a roughly 40-artist catalogue | S | Change to 'browse dozens of independent artists' or drop the number. |
| A37 | Public/auth | Demo login sets an ssr-format cookie nothing in the app reads; portal tour lands logged out | M | Redirect with tokens to a client page calling supabase.auth.setSession, or adopt @supabase/ssr. |
| A39 | Public/auth | /customer repeats the 'hundreds of independent artists' overclaim | S | Reword to 'dozens' or drop the number, together with A20. |
| A43 | Public/auth | 'Other' venue type free-text is stripped by validation and never stored | S | Add customVenueType to registerVenueSchema and merge it into the stored venueType. |
| A44 | Public/auth | Venue confirmation email frames open registration as an application under review | S | Change subject and body to a welcome / confirm-your-email framing. |
| B9 | Browse/buy | Lightbox enquiry form always fails for guests and customers | S | For guests and customers, POST /api/enquiry directly and confirm on its success; keep /api/messages for venues. |
| B12 | Browse/buy | Customer 'Message the artist' link lands in a 403-dead messages portal | S | Route signed-in customers to /contact?artist=<slug>, matching MessageArtistButton. |
| B13 | Browse/buy | Collection work tiles link by UUID; artwork route resolves only slugified titles | S | Link to /browse/<artistSlug>/<slugify(work.title)> instead of work.id. |
| B20 | Browse/buy | Confirmation never checks payment_status before asserting payment received | S | Render the paid receipt only when status is 'paid'; otherwise show a hedged pending state. |
| B21 | Browse/buy | Failed session lookup still asserts 'payment was received successfully' | S | Hedge the fallback copy: 'If your payment completed you'll receive a confirmation email shortly.' |
| B27 | Browse/buy | Collect lines under a ship order keep in-store price, skip placement check | M | When order fulfilment is ship, re-price collect lines at the tier price or reject them with a 409. |
| B29 | Browse/buy | POST /api/disputes has no buyer-facing entry point anywhere | M | Add a 'Report a problem' form on the order page wired to POST /api/disputes. |
| C4 | Customer/account | Emails, notifications and /orders/[id] link /customer-portal/orders, which 404s | S | Add a next.config redirect from /customer-portal/orders to /customer-portal, mapping ?id= to ?order=. |
| C5 | Customer/account | Blank partial-refund amount: submit enabled, server 400 silently ignored | S | Disable submit until a valid partial amount is entered, and surface non-2xx errors inline. |
| C6 | Customer/account | Refund request submission fails silently on any non-2xx or network error | S | Add an inline error state for non-2xx and network failures, mirroring confirmDelivery's confirmError pattern. |
| C14 | Customer/account | Hard delete leaves buyer name and address in email-keyed orders while claiming success | S | Add a buyer_email-keyed anonymisation pass (buyer_email and shipping) mirroring step 4 of the soft route. |
| C15 | Customer/account | POST /api/account/delete lacks the demo guard every sibling mutation has | S | Add assertNotDemo (or the strict 403 variant) at the top of the POST handler. |
| C18 | Customer/account | Refund-approved notification link and sale fallback both 404 for customers | S | Store /customer-portal?order={id}, fix the Header customer fallback, and add the C4 redirect as a backstop. |
| D15 | Artist portal | Collections publish live with no subscription gate, unlike works | S | Apply the same GATING_V1 402 check to collections POST/PATCH when available is true. |
| D18 | Artist portal | Refund approve/reject fails silently on any non-2xx response | S | Handle non-ok responses in processRefund with a toast carrying the server's error message. |
| D19 | Artist portal | "Issue Refund" always 403s on self-approve yet UI closes as if refunded | S | Rename to "Request refund", skip the doomed approve call, and show a queued-for-admin state. |
| D22 | Artist portal | Saving without an image publishes a picsum stock photo as the artwork | S | Require an image before save, or force imageless works to available=false drafts. |
| D24 | Artist portal | Bulk add silently discards incomplete drafts when any draft is valid | S | Keep invalid drafts in the modal with per-draft errors instead of clearing them. |
| E23 | Venue/curation | Artwork-request share field uses opposite direction to placements' venue-cut semantics | M | Standardise on the venue-cut direction platform-wide and relabel this field to match. |
| E24 | Venue/curation | Accepting a commission response navigates the venue straight to a 404 | S | Retarget nextStepLink to the request detail page until a commissions surface exists. |
| E38 | Venue/curation | Every tier detail footer promises cancel any time, including one-off payments | S | Show cancel any time only for the managed subscription tiers. |
| F2 | Messaging/placements | Hover-X delete hard-deletes both parties' copies; confirm gives no warning | M | Implement per-user archiving (hidden flags) or warn explicitly that both parties lose the thread. |
| F7 | Messaging/placements | Message email links venues into artist portal, never auto-opens thread, subject uses raw slug | S | Resolve portal per recipient role, pass display name, and honour ?c= to preselect the thread. |
| F15 | Messaging/placements | Customer portal Messages invents a client-side slug; API 403s, inbox permanently empty | M | Give customers a server-side messaging identity, or remove the nav item and route to /contact. |
| F17 | Messaging/placements | Logged-out Message CTA funnels signups into the dead customer messaging surface | S | Route logged-out shoppers to /contact?artist=<slug> like the logged-in customer path. |
| F19 | Messaging/placements | Ungated enquiry modal collects name/email but the send 401s/403s for its audience | S | Make /api/enquiry the primary for anonymous/customer senders; keep /api/messages for profiled users. |
| G11 | Admin | Managed curation refund never refunds: Invoice.payment_intent gone on pinned API | S | List the invoice with expand:['data.payments'] and refund via payments.data[0].payment.payment_intent; update tests. |
| G27 | Admin | Flagged-message moderation queue has no admin page | M | Add a Messages tab or page reusing the feature-requests queue pattern with entity_type=message. |
| H8 | Roles/system | Every customer Messages surface dead-ends at a 403 API | S | Remove customer Messages nav, dropdown entry and page until customer conversations are built. |
| H9 | Roles/system | Logged-out message CTA signs shoppers up into the dead messages page | S | Send logged-out visitors through the same /contact?artist= flow as logged-in customers. |
| H10 | Roles/system | Demo login sets auth cookies nothing reads; portal tour bounces to login | M | Redirect to a client bridge page carrying tokens and call supabase.auth.setSession, or adopt @supabase/ssr. |
| H15 | Roles/system | OAuth signups never record terms acceptance server-side | S | Record platform_tos in oauth-finalize when stamping a new OAuth user's role. |
| H20 | Roles/system | Message notification emails link every recipient to the artist portal | S | Pass the recipient's portal base into sendMessageUnreadEmail from each call site. |

## Ratings changed under challenge

| Ref | Verifier | Final | Challenger's reason |
|---|---|---|---|
| A18 | P1 | P2 | Copy conflict where Terms govern; harm needs an actual cancellation dispute, near-zero at launch volume. Rubric calls this a minor copy conflict. |
| A20 | P2 | P1 | 'Hundreds of storefronts' against a roughly 39-artist catalogue is materially false copy on a primary buyer-funnel page, falsified one click later. |
| A21 | P1 | P2 | A signed certificate is a physical artefact fulfillable manually at launch volume, or a one-line copy edit; operational promise, not a software gate. |
| A33 | P1 | P2 | The lead (name, email, userType) is stored; dropped fields are optional enrichment recoverable by email follow-up. Funnel intact. |
| A39 | P2 | P1 | Same 'hundreds of independent artists' overclaim on /customer, the buyer landing page; trust-damaging false copy on a high-traffic funnel surface. |
| A40 | P1 | P2 | Duplicate of A21; the same copy fix resolves both. |
| A43 | P2 | P1 | Venue's typed 'Other' description is silently stripped by zod and never stored; the rubric's P1 class of forms silently discarding user input. |
| A44 | P2 | P1 | Every venue signup email claims 'application received', implying review; venues wait for approval that never comes. False transactional copy stalling the venue funnel. |
| A49 | P1 | P2 | Only signed-in wrong-role users visiting /apply hit it; manual sign-out via header recovers. Confusing loop, not a funnelled dead surface. |
| A50 | P1 | P2 | Apply deliberately accepts a typed contact email like any contact form; rate-limited 5/min; abuse vector is ordinary contact-form grade. |
| A51 | P1 | P2 | Checkbox is shown and ticked; only persistence is lost. Evidentiary gap, consumer rights themselves unaffected; harm speculative until a dispute. |
| A53 | P1 | P2 | Optional 'get a head start' CTA after the application already succeeded; the account already exists and normal login works. Confusing message, funnel intact. |
| B8 | P1 | P2 | Frame uplift and total price shown transparently in the lightbox; unframed purchase available on the artwork page. No silent overcharge, alternative surface exists. |
| B20 | P2 | P1 | Page claims 'Payment of £X received' without reading the returned Stripe status; unpaid or expired sessions get a false money-received assertion. |
| B21 | P2 | P1 | Asserts 'payment was received successfully' when the lookup failed entirely; an unverifiable money claim rendered for any bogus session id. |
| B23 | P1 | P2 | Post-purchase convenience link; the buyer funnel already completed. Confusing 404, no funnel or money harm. |
| B28 | P1 | P2 | Lightbox caps quantity client-side, so exploiting needs a crafted request; clamp prevents negative stock; consequence is an oversell needing a refund, an admin task. |
| B29 | P2 | P1 | FAQ ties payout release to 'buyer dispute', but no dispute entry point exists and processPendingTransfers never checks disputes; the promised buyer protection is unusable. |
| B31 | P1 | P2 | Only fires when the buyer deliberately cancels on Stripe; no money moved; back-navigation recovers. Not a funnel surface. |
| C11 | P1 | P2 | No send path reads customer prefs, so the card controls nothing that exists; dead settings control, marketing opt-out lives in email_preferences separately. |
| C12 | P1 | P2 | Harm requires a hypothetical per-table scrub error; the concrete demonstrated gap is C14. Speculative failure path, fix alongside C14. |
| C13 | P1 | P2 | Rare user action at launch, database backups mitigate, and it is an owner policy ruling; not launch-gating. |
| C14 | P0 | P1 | Erasure requests near zero at launch; GDPR allows manual fulfilment within a month and order retention has a lawful basis. Real defect is the false success claim. |
| C15 | P2 | P1 | Public demo login lets any visitor hard-delete the shared demo auth user and seeded data; sibling mutations are guarded, this one is not. |
| C25 | P1 | P2 | RFC 8058 one-click is a Gmail/Yahoo bulk-sender rule (5k+/day), far beyond launch volume; mailto arm works; the legal unsubscribe gate is C24. |
| C26 | P1 | P2 | Fails safe: prefetchers can only over-unsubscribe, no PII exposed; random UUIDs are unguessable. Engagement nuisance, not a compliance or security hole. |
| C30 | P1 | P2 | Error state surfaces the privacy@ manual route; GDPR access can be fulfilled manually at launch volume. Not a dead end. |
| C33 | P1 | P2 | Unreachable until C30 is fixed (export never runs); manual fulfilment covers access requests meanwhile. Fix with C30. |
| D1 | P1 | P2 | Gate audience is past_due/canceled only, an empty set at launch; Stripe checkout shows the real charge before payment. Fix before first cancellations, weeks away. |
| D10 | P1 | P2 | Same empty-at-launch audience as D1; nobody is canceled or past_due on day one, and Stripe displays the actual amount due. |
| D15 | P2 | P1 | GATING_V1 prodDefault is true (feature-flags.ts:74), so the paid publish gate is live while collections publish publicly ungated: a full paywall bypass. |
| D21 | P1 | P2 | Stuck button, recoverable with a refresh and re-upload; artist-side only, no data loss. Confusing UX with a workaround. |
| D24 | P2 | P1 | Bulk add silently discards typed titles and uploaded images of incomplete drafts whenever any draft is valid; the rubric's silent-input-discard class. |
| D26 | P1 | P2 | Needs self-inflicted invalid input by the artist; terms are visible to the counterparty before acceptance; clamp is a trivial post-launch fix. |
| E5 | P1 | P2 | No producer of venue-directed enquiries exists, so the empty page misses nothing real; a plausible empty state, not lost data. |
| E8 | P1 | P2 | Defaults are editable and only degrade matching quality; wrong-but-harmless data, no money or destruction involved. |
| E12 | P1 | P2 | With no save button the form never claims persistence, so nothing lies to the user; display-only settings section. |
| E13 | P1 | P2 | Checkboxes show defaults for transactional notification toggles; no marketing or legal exposure, cosmetic wrong state. |
| E15 | P1 | P2 | One weekly digest; harm requires the digest actually sending and a venue trying to opt out; fix rides the email-preferences work. |
| E16 | P1 | P2 | Display label only on the expanded row; the request form and payout maths agree, so no money moves wrongly. Copy fix. |
| E25 | P1 | P2 | Secondary link with the same root cause as E24 (kept P1); one fix covers both. |
| E27 | P1 | P2 | Same as E5: no venue-directed enquiries are ever created, so the permanently empty list loses nothing. |
| E31 | P1 | P2 | Saves persist and render correctly in the wall visualizer via /api/walls/saved-works; display filter bug on one tab, no data loss. |
| E38 | P2 | P1 | 'Cancel any time' printed under one-off and quoted tiers is a false term of sale on a purchase decision surface; refund-expectation liability. |
| F6 | P1 | P2 | Visible 'Message too short' error with a trivial workaround: type a word. Not silent, not a dead surface. |
| F8 | P1 | P2 | Replies within the open thread are exempt; the cap only mis-bites artists active in 5+ distinct threads in one day, rare at launch volume. |
| F14 | P1 | P2 | Block usage is near zero at launch and the primary contact vector (messages) is enforced; ancillary bypass harm is speculative. |
| F16 | P1 | P2 | Error copy on a surface already dead per F15 (kept P1); becomes moot when that surface is fixed or removed. |
| F24 | P1 | P2 | Verified: /placements/[id] API infers requester_user_id and the detail page renders working Accept/Counter/Decline; lists link straight to it. One-click workaround. |
| F42 | P1 | P2 | Duplicate of B31; deliberate cancel path, no money moved, recoverable by navigation. |
| F51 | P1 | P2 | Same workaround as F24: the detail page resolves the requester and shows respond actions, so the placement funnel completes despite list-surface gaps. |
| G2 | P1 | P2 | Missing nav item only; the substantive gap is G28. Admin inconvenience. |
| G11 | P0 | P1 | Admin-triggered, rare flow with a manual workaround (Stripe dashboard refund); kept P1 not P2 because the false cancelled-without-refund state is silent. |
| G18 | P1 | P2 | Harm requires an admin writing candid shorthand into a rare dispute flow; a one-line instruction to the admin avoids it entirely. |
| G27 | P2 | P1 | Users' abuse reports insert moderation_queue rows no page reads; reports silently vanish with no admin surface. A safety funnel dead end-to-end. |
| G28 | P1 | P2 | Rubric-exact admin inconvenience with manual workarounds: the process API is callable directly and Stripe dashboard refunds work; launch refund volume near zero. Needs a runbook. |
| H18 | P0 | P2 | Header one-click is bulk-sender-scale deliverability, not the legal path; verified mailto arm exists and the header URL does carry u. C24 (kept P0) is the compliance gate. |
| H20 | P2 | P1 | Every venue message-notification email deep-links /artist-portal; PortalGuard bounces venues, losing the conversation. Broken notification links across the core messaging loop. |
| H21 | P1 | P2 | No trial can end until a full trial period after launch, so a fix window exists before any user is charged unwarned. Fix-soon, not a gate. |

## P2 and P3 by area (fix after launch / accepted)

| Area | P2 | P3 |
|---|---|---|
| A. Public/auth | 30 | 20 |
| B. Browse/buy | 20 | 4 |
| C. Customer/account | 18 | 11 |
| D. Artist portal | 14 | 9 |
| E. Venue/curation | 23 | 12 |
| F. Messaging/placements | 31 | 15 |
| G. Admin | 19 | 9 |
| H. Roles/system | 13 | 11 |

The full per-flag detail for every severity, including the verifier's
file-level evidence and one-line fix for all 300 items, is retained in the
machine-readable triage output; the P2/P3 items remain listed as FLAG rows in
the inventory document itself.
