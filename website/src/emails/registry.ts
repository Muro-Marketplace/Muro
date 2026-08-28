// Central registry, every template in the library, with metadata.
// Add a new template: create the file, import its default here, push it
// into EMAIL_REGISTRY. That's it.
//
// The preview route, the send helper, and any future dashboards all read
// from this single source of truth.

import type { TemplateEntry } from "./registry-types";

// ── Account ───────────────────────────────────────────────────────────────
import AccountEmailVerification from "./templates/account/AccountEmailVerification";
import AccountPasswordReset from "./templates/account/AccountPasswordReset";
import AccountPasswordChanged from "./templates/account/AccountPasswordChanged";
import AccountDeletionRequested from "./templates/account/AccountDeletionRequested";
import AccountDeletionConfirmed from "./templates/account/AccountDeletionConfirmed";
import AccountDataExportReady from "./templates/account/AccountDataExportReady";
import AccountSuspiciousLogin from "./templates/account/AccountSuspiciousLogin";
import AccountEmailChangeVerify from "./templates/account/AccountEmailChangeVerify";
import AccountTwoFactorEnabled from "./templates/account/AccountTwoFactorEnabled";
import AccountTwoFactorDisabled from "./templates/account/AccountTwoFactorDisabled";
import AccountTeamInvite from "./templates/account/AccountTeamInvite";
import AccountTeamInviteAccepted from "./templates/account/AccountTeamInviteAccepted";
import SupportRequestReceived from "./templates/account/SupportRequestReceived";

// ── Onboarding ────────────────────────────────────────────────────────────
import ArtistWelcomeChecklist from "./templates/onboarding/artist/ArtistWelcomeChecklist";
import ArtistProfileCompletionNudge from "./templates/onboarding/artist/ArtistProfileCompletionNudge";
import ArtistFirstArtworkUploadNudge from "./templates/onboarding/artist/ArtistFirstArtworkUploadNudge";
import ArtistConnectStripeNudge from "./templates/onboarding/artist/ArtistConnectStripeNudge";
import ArtistPlacementPreferencesNudge from "./templates/onboarding/artist/ArtistPlacementPreferencesNudge";
import ArtistOnboardingGraduation from "./templates/onboarding/artist/ArtistOnboardingGraduation";
import ArtistOnboardingIncompleteRecap from "./templates/onboarding/artist/ArtistOnboardingIncompleteRecap";
import VenueWelcomeChecklist from "./templates/onboarding/venue/VenueWelcomeChecklist";
import VenueSpaceDetailsNudge from "./templates/onboarding/venue/VenueSpaceDetailsNudge";
import VenuePhotoUploadNudge from "./templates/onboarding/venue/VenuePhotoUploadNudge";
import VenueArtPreferencesNudge from "./templates/onboarding/venue/VenueArtPreferencesNudge";
import VenueFirstPlacementCta from "./templates/onboarding/venue/VenueFirstPlacementCta";
import CustomerWelcome from "./templates/onboarding/customer/CustomerWelcome";
import CustomerBrowseNudge from "./templates/onboarding/customer/CustomerBrowseNudge";
import CustomerFollowArtistNudge from "./templates/onboarding/customer/CustomerFollowArtistNudge";

// ── Placements ────────────────────────────────────────────────────────────
import VenueNewPlacementRequest from "./templates/placements/VenueNewPlacementRequest";
// K1: the mirror of the above, for venue-initiated requests. Its absence is why
// a legacy hand-written fallback survived on that half of the flow.
import ArtistNewPlacementInvitation from "./templates/placements/ArtistNewPlacementInvitation";
import ArtistPlacementRequestSent from "./templates/placements/ArtistPlacementRequestSent";
import ArtistPlacementAccepted from "./templates/placements/ArtistPlacementAccepted";
import VenuePlacementAcceptedConfirmation from "./templates/placements/VenuePlacementAcceptedConfirmation";
import ArtistPlacementDeclined from "./templates/placements/ArtistPlacementDeclined";
import PlacementVenueDeclinedArtistRequest from "./templates/placements/PlacementVenueDeclinedArtistRequest";
import PlacementCancelled from "./templates/placements/PlacementCancelled";
import PlacementCounterOfferReceived from "./templates/placements/PlacementCounterOfferReceived";
import PlacementScheduled from "./templates/placements/PlacementScheduled";
import PlacementArtworkInstalled from "./templates/placements/PlacementArtworkInstalled";
import PlacementMidwayCheckin from "./templates/placements/PlacementMidwayCheckin";
import PlacementEndingSoon from "./templates/placements/PlacementEndingSoon";
import PlacementEnded from "./templates/placements/PlacementEnded";
import PlacementReviewRequest from "./templates/placements/PlacementReviewRequest";
import PlacementConsignmentRecordCreated from "./templates/placements/PlacementConsignmentRecordCreated";
import PlacementContractCountersigned from "./templates/placements/PlacementContractCountersigned";

// ── Messages ──────────────────────────────────────────────────────────────
// ── Admin (internal) ──────────────────────────────────────────────────────
// K1: one template for every operational alert to the Wallplace team, replacing
// eight near-identical hand-written HTML notifiers in the deleted lib/email.ts.
import AdminAlert from "./templates/admin/AdminAlert";

import MessageUnreadNotification from "./templates/messages/MessageUnreadNotification";
import MessageHourlyDigest from "./templates/messages/MessageHourlyDigest";
import ReviewPostedNotification from "./templates/messages/ReviewPostedNotification";
import OfferReceivedNotification from "./templates/messages/OfferReceivedNotification";

// ── Performance (artist) ──────────────────────────────────────────────────
import ArtistFirstQrScan from "./templates/performance/ArtistFirstQrScan";
import ArtistQrScanMilestone from "./templates/performance/ArtistQrScanMilestone";
// 09 item 1.6: this template existed with a full TemplateEntry but was never
// imported here, so it was invisible to the registry, the preview library and
// every audit that walks EMAIL_REGISTRY.
import ArtistQrScanDigest from "./templates/performance/ArtistQrScanDigest";
import ArtistWeeklyPortfolioDigest from "./templates/performance/ArtistWeeklyPortfolioDigest";
import ArtistNewVenueMatch from "./templates/performance/ArtistNewVenueMatch";
import ArtistLowEngagementTips from "./templates/performance/ArtistLowEngagementTips";

// ── Venue lifecycle ───────────────────────────────────────────────────────
import VenueWeeklyDigest from "./templates/venue-lifecycle/VenueWeeklyDigest";
import VenueNewArtistMatches from "./templates/venue-lifecycle/VenueNewArtistMatches";
import VenueRotationReminder from "./templates/venue-lifecycle/VenueRotationReminder";
import VenuePlacementAnniversary from "./templates/venue-lifecycle/VenuePlacementAnniversary";
import VenueManagedCurationPitch from "./templates/venue-lifecycle/VenueManagedCurationPitch";
import VenueRegistrationConfirmation from "./templates/venue-lifecycle/VenueRegistrationConfirmation";
// K1: the two curation customer emails, replacing hand-written HTML in the
// deleted lib/email.ts.
import CurationEnquiryReceived from "./templates/venue-lifecycle/CurationEnquiryReceived";
import CurationPaymentReceived from "./templates/venue-lifecycle/CurationPaymentReceived";
import VenueCollectionPending from "./templates/venue-lifecycle/VenueCollectionPending";
// D18: the counterpart to CurationPaymentReceived, sent by the admin refund endpoint.
import CurationRefundIssued from "./templates/venue-lifecycle/CurationRefundIssued";
// K1: the per-sale venue notice, distinct from the periodic revenue-share statement.
import VenueSaleFromPlacement from "./templates/venue-lifecycle/VenueSaleFromPlacement";

// ── Orders ────────────────────────────────────────────────────────────────
import CustomerOrderReceipt from "./templates/orders/CustomerOrderReceipt";
import ArtistWorkSold from "./templates/orders/ArtistWorkSold";
import ArtistOrderConfirmation from "./templates/orders/ArtistOrderConfirmation";
import CustomerShippingConfirmation from "./templates/orders/CustomerShippingConfirmation";
import CustomerDeliveryConfirmation from "./templates/orders/CustomerDeliveryConfirmation";
import CustomerPostPurchaseCare from "./templates/orders/CustomerPostPurchaseCare";
import CustomerPurchaseReviewRequest from "./templates/orders/CustomerPurchaseReviewRequest";
import CustomerRefundConfirmation from "./templates/orders/CustomerRefundConfirmation";
import CustomerPaymentFailed from "./templates/orders/CustomerPaymentFailed";
// K1: the decline counterpart. Its absence is why the legacy notifyRefundDecision
// survived after the approve half had already moved to the pipeline.
import CustomerRefundRejected from "./templates/orders/CustomerRefundRejected";
// K1: the statuses the purpose-built lifecycle templates do not cover.
import CustomerOrderStatusUpdate from "./templates/orders/CustomerOrderStatusUpdate";
import ArtistRefundNotification from "./templates/orders/ArtistRefundNotification";
// K1: distinct from the above. That one says a refund HAS been issued; this one
// says one has been asked for and nothing has moved yet.
import ArtistRefundRequested from "./templates/orders/ArtistRefundRequested";
import OrderDisputeOpened from "./templates/orders/OrderDisputeOpened";
import OrderDisputeResolved from "./templates/orders/OrderDisputeResolved";

// Phase 2 lifecycle templates — purpose-built per Phase 2.0c so the J1
// dispatcher binds one logical event to one template.
import ArtistOrderReceived from "./templates/orders/ArtistOrderReceived";
import CustomerOrderPlaced from "./templates/orders/CustomerOrderPlaced";
import CustomerOrderProcessing from "./templates/orders/CustomerOrderProcessing";
import CustomerOrderOutForDelivery from "./templates/orders/CustomerOrderOutForDelivery";
import CustomerOrderDelivered from "./templates/orders/CustomerOrderDelivered";
import CustomerConfirmDelivery48h from "./templates/orders/CustomerConfirmDelivery48h";

// ── Payments ──────────────────────────────────────────────────────────────
import ArtistPayoutSent from "./templates/payments/ArtistPayoutSent";
import ArtistPayoutFailed from "./templates/payments/ArtistPayoutFailed";
import SubscriptionPaymentFailed from "./templates/payments/SubscriptionPaymentFailed";
// Owner decision 2026-08-28: the venue is EMAILED to set up the paid-loan
// payment, not just shown a chip.
import PaidLoanSetUpPayment from "./templates/payments/PaidLoanSetUpPayment";
// WS4.3: paid-loan dunning to the venue, wired from invoice.payment_failed.
import PaidLoanPaymentFailed from "./templates/payments/PaidLoanPaymentFailed";
import ReferralCreditGranted from "./templates/payments/ReferralCreditGranted";
import SubscriptionRecovered from "./templates/payments/SubscriptionRecovered";
import ReferralWindowEnding from "./templates/payments/ReferralWindowEnding";
import SubscriptionTrialEnding from "./templates/payments/SubscriptionTrialEnding";
import SubscriptionUpgraded from "./templates/payments/SubscriptionUpgraded";
import SubscriptionCancelled from "./templates/payments/SubscriptionCancelled";
import VenueRevenueShareStatement from "./templates/payments/VenueRevenueShareStatement";
import VenuePaidLoanInvoice from "./templates/payments/VenuePaidLoanInvoice";
import SubscriptionStarted from "./templates/payments/SubscriptionStarted";
import SubscriptionRenewalReceipt from "./templates/payments/SubscriptionRenewalReceipt";
import SubscriptionCardExpiring from "./templates/payments/SubscriptionCardExpiring";

// ── Artist additions ──────────────────────────────────────────────────────
import ArtistStripeKycNeeded from "./templates/artist-additions/ArtistStripeKycNeeded";
import ArtistApplicationSubmitted from "./templates/artist-additions/ArtistApplicationSubmitted";
import ArtistApplicationUnderReview from "./templates/artist-additions/ArtistApplicationUnderReview";
import ArtistApplicationApproved from "./templates/artist-additions/ArtistApplicationApproved";
import ArtistApplicationRejected from "./templates/artist-additions/ArtistApplicationRejected";
import ArtistYearInReview from "./templates/artist-additions/ArtistYearInReview";

// ── Premium ───────────────────────────────────────────────────────────────
import ArtistTierCapHit from "./templates/premium/ArtistTierCapHit";
import ArtistPremiumUpgradeEducational from "./templates/premium/ArtistPremiumUpgradeEducational";
import VenueAnalyticsUpgrade from "./templates/premium/VenueAnalyticsUpgrade";
import VenueManagedCurationUpgrade from "./templates/premium/VenueManagedCurationUpgrade";

// ── Customer sales ────────────────────────────────────────────────────────
import CustomerAbandonedCheckout1h from "./templates/customer-sales/CustomerAbandonedCheckout1h";
import CustomerAbandonedCheckout24h from "./templates/customer-sales/CustomerAbandonedCheckout24h";
import CustomerSavedWorkBackInStock from "./templates/customer-sales/CustomerSavedWorkBackInStock";
import CustomerSavedWorkPriceDrop from "./templates/customer-sales/CustomerSavedWorkPriceDrop";
import CustomerNewWorkFromFollowedArtist from "./templates/customer-sales/CustomerNewWorkFromFollowedArtist";
import CustomerSavedWorksDigest from "./templates/customer-sales/CustomerSavedWorksDigest";
import CustomerWaitlistConfirmation from "./templates/customer-sales/CustomerWaitlistConfirmation";

// ── Re-engagement ─────────────────────────────────────────────────────────
import ArtistInactive14d from "./templates/re-engagement/ArtistInactive14d";
import ArtistInactive30d from "./templates/re-engagement/ArtistInactive30d";
import ArtistInactive90d from "./templates/re-engagement/ArtistInactive90d";
import VenueInactive30d from "./templates/re-engagement/VenueInactive30d";
import VenueInactive90dWhiteGlove from "./templates/re-engagement/VenueInactive90dWhiteGlove";
import CustomerInactive30d from "./templates/re-engagement/CustomerInactive30d";
import CustomerInactive90d from "./templates/re-engagement/CustomerInactive90d";
import UserRepermissionCampaign from "./templates/re-engagement/UserRepermissionCampaign";

// ── Newsletter ────────────────────────────────────────────────────────────
import NewsletterMonthlyGallery from "./templates/newsletter/NewsletterMonthlyGallery";
import NewsletterSubscribeConfirm from "./templates/newsletter/NewsletterSubscribeConfirm";
import NewsletterArtistSpotlight from "./templates/newsletter/NewsletterArtistSpotlight";
import NewsletterVenueSpotlight from "./templates/newsletter/NewsletterVenueSpotlight";
import NewsletterCuratorsPicks from "./templates/newsletter/NewsletterCuratorsPicks";
import NewsletterLocalArtNearYou from "./templates/newsletter/NewsletterLocalArtNearYou";

// ── Legal / operational ───────────────────────────────────────────────────
import LegalTermsUpdate from "./templates/legal/LegalTermsUpdate";
import LegalPrivacyUpdate from "./templates/legal/LegalPrivacyUpdate";
import ArtistTaxDocumentReady from "./templates/legal/ArtistTaxDocumentReady";
import OperationalPlatformIncident from "./templates/legal/OperationalPlatformIncident";
import OperationalPolicyViolationWarning from "./templates/legal/OperationalPolicyViolationWarning";
import OperationalAccountRestricted from "./templates/legal/OperationalAccountRestricted";
import OperationalAccountRestored from "./templates/legal/OperationalAccountRestored";

// ── Dead-template decision pass (WS5.6, txn audit 4 finding R4.11) ────────
//
// The 2026-08-28 email audit found 59 registry templates with no live send
// site. "Dead" must be a decision, not an accident, so every one of them is
// classified below. None is deleted: the registry is a library built ahead
// of the product, `npm run email:audit` reports the live count from the
// code, and a registered-but-dormant template costs nothing while keeping
// the preview library and the wiring plan honest.
//
// 1. WAS OWED A SENDER by the 2026-08-28 transaction-hardening plan and has
//    since been wired (WS4 recurring-billing work, on the Stripe webhook and
//    paid-loan billing paths), so these two are no longer dead:
//      venue_paid_loan_invoice      (WS4.8: invoice.paid receipt to the
//                                    paying venue)
//      subscription_card_expiring   (WS4.5: customer.source.expiring, the
//                                    pre-dunning warning)
//
// 2. SUPABASE GOTRUE OWNS THE FLOW today. These sends happen, but outside
//    the pipeline: no email_events row, no idempotency, no health-check
//    visibility. Kept as the documented replacement targets for when auth
//    mail moves onto our own SMTP or a GoTrue hook:
//      account_email_verification, account_password_reset,
//      account_email_change_verify
//
// 3. RETIRED BY DESIGN (09 item 1.3 / Phase 2 dispatcher). Their content
//    moved onto the purpose-built lifecycle templates; the entries stay so
//    the preview library and historical email_events rows still resolve:
//      customer_order_receipt, artist_work_sold, artist_order_confirmation,
//      customer_shipping_confirmation, customer_delivery_confirmation
//
// 4. DELIBERATELY DORMANT, the triggering feature, campaign tool or cron
//    does not exist yet. Wire when the feature ships, not before:
//      account_two_factor_enabled / _disabled (no 2FA),
//      account_team_invite / _accepted (no teams),
//      account_data_export_ready (no export feature),
//      customer_browse_nudge, customer_follow_artist_nudge (not in the
//        nudge cron), placement_midway_checkin, message_hourly_digest,
//      artist_first_qr_scan, artist_qr_scan_milestone (no trigger),
//      artist_new_venue_match, venue_new_artist_matches (no matcher),
//      venue_rotation_reminder, venue_placement_anniversary,
//      artist_low_engagement_tips, artist_year_in_review,
//      artist_tier_cap_hit (no cap enforcement),
//      artist_premium_upgrade_educational, venue_analytics_upgrade,
//      venue_managed_curation_upgrade, venue_managed_curation_pitch,
//      customer_abandoned_checkout_1h / _24h (no abandonment tracking),
//      customer_saved_work_back_in_stock, customer_saved_work_price_drop,
//      customer_new_work_from_followed_artist, customer_saved_works_digest,
//      customer_post_purchase_care, customer_purchase_review_request,
//      artist_application_under_review (status exists, sender undecided),
//      user_repermission_campaign, newsletter_monthly_gallery,
//      newsletter_artist_spotlight, newsletter_venue_spotlight,
//      newsletter_curators_picks, newsletter_local_art_near_you (no
//        campaign sender exists)
//
// 5. DORMANT PENDING AN OWNER DECISION, flagged by R4.11 as money or legal
//    surface gaps that need product work beyond an email call, and not yet
//    scheduled in the hardening plan:
//      account_password_changed (GoTrue sends nothing; needs a hook),
//      account_deletion_requested, account_deletion_confirmed (deletion
//        flow currently sends no mail),
//      legal_terms_update, legal_privacy_update (no ToS-change mechanism),
//      artist_tax_document_ready (no generator),
//      operational_platform_incident, operational_policy_violation_warning,
//      operational_account_restricted, operational_account_restored
//        (moderation has no email surface),
//      venue_revenue_share_statement (no statement generator or cron),
//      placement_ending_soon (cron exists, deliberately gated off: no
//        end-date column; D60)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EMAIL_REGISTRY: TemplateEntry<any>[] = [
  AdminAlert,
  VenueSaleFromPlacement,
  CustomerOrderStatusUpdate,
  CustomerRefundRejected,
  ArtistRefundRequested,
  ArtistNewPlacementInvitation,
  CurationEnquiryReceived,
  CurationPaymentReceived,
  VenueCollectionPending,
  CurationRefundIssued,
  // Account
  AccountEmailVerification,
  AccountPasswordReset,
  AccountPasswordChanged,
  AccountDeletionRequested,
  AccountDeletionConfirmed,
  AccountDataExportReady,
  AccountSuspiciousLogin,
  AccountEmailChangeVerify,
  AccountTwoFactorEnabled,
  AccountTwoFactorDisabled,
  AccountTeamInvite,
  AccountTeamInviteAccepted,
  SupportRequestReceived,

  // Onboarding
  ArtistWelcomeChecklist,
  ArtistProfileCompletionNudge,
  ArtistFirstArtworkUploadNudge,
  ArtistConnectStripeNudge,
  ArtistPlacementPreferencesNudge,
  ArtistOnboardingGraduation,
  ArtistOnboardingIncompleteRecap,
  VenueWelcomeChecklist,
  VenueSpaceDetailsNudge,
  VenuePhotoUploadNudge,
  VenueArtPreferencesNudge,
  VenueFirstPlacementCta,
  CustomerWelcome,
  CustomerBrowseNudge,
  CustomerFollowArtistNudge,

  // Placements
  VenueNewPlacementRequest,
  ArtistPlacementRequestSent,
  ArtistPlacementAccepted,
  VenuePlacementAcceptedConfirmation,
  ArtistPlacementDeclined,
  PlacementVenueDeclinedArtistRequest,
  PlacementCancelled,
  PlacementCounterOfferReceived,
  PlacementScheduled,
  PlacementArtworkInstalled,
  PlacementMidwayCheckin,
  PlacementEndingSoon,
  PlacementEnded,
  PlacementReviewRequest,
  PlacementConsignmentRecordCreated,
  PlacementContractCountersigned,

  // Messages
  MessageUnreadNotification,
  MessageHourlyDigest,
  ReviewPostedNotification,
  OfferReceivedNotification,

  // Performance
  ArtistFirstQrScan,
  ArtistQrScanMilestone,
  ArtistQrScanDigest,
  ArtistWeeklyPortfolioDigest,
  ArtistNewVenueMatch,
  ArtistLowEngagementTips,

  // Venue lifecycle
  VenueWeeklyDigest,
  VenueNewArtistMatches,
  VenueRotationReminder,
  VenuePlacementAnniversary,
  VenueManagedCurationPitch,
  VenueRegistrationConfirmation,

  // Orders
  CustomerOrderReceipt,
  ArtistWorkSold,
  ArtistOrderConfirmation,
  CustomerShippingConfirmation,
  CustomerDeliveryConfirmation,
  CustomerPostPurchaseCare,
  CustomerPurchaseReviewRequest,
  CustomerRefundConfirmation,
  CustomerPaymentFailed,
  ArtistRefundNotification,
  OrderDisputeOpened,
  OrderDisputeResolved,

  // Phase 2 lifecycle (Phase 2.0c)
  ArtistOrderReceived,
  CustomerOrderPlaced,
  CustomerOrderProcessing,
  CustomerOrderOutForDelivery,
  CustomerOrderDelivered,
  CustomerConfirmDelivery48h,

  // Payments
  ArtistPayoutSent,
  ArtistPayoutFailed,
  SubscriptionPaymentFailed,
  PaidLoanSetUpPayment,
  PaidLoanPaymentFailed,
  ReferralCreditGranted,
  SubscriptionRecovered,
  ReferralWindowEnding,
  SubscriptionTrialEnding,
  SubscriptionUpgraded,
  SubscriptionCancelled,
  VenueRevenueShareStatement,
  VenuePaidLoanInvoice,
  SubscriptionStarted,
  SubscriptionRenewalReceipt,
  SubscriptionCardExpiring,

  // Artist additions
  ArtistStripeKycNeeded,
  ArtistApplicationSubmitted,
  ArtistApplicationUnderReview,
  ArtistApplicationApproved,
  ArtistApplicationRejected,
  ArtistYearInReview,

  // Premium
  ArtistTierCapHit,
  ArtistPremiumUpgradeEducational,
  VenueAnalyticsUpgrade,
  VenueManagedCurationUpgrade,

  // Customer sales
  CustomerAbandonedCheckout1h,
  CustomerAbandonedCheckout24h,
  CustomerSavedWorkBackInStock,
  CustomerSavedWorkPriceDrop,
  CustomerNewWorkFromFollowedArtist,
  CustomerSavedWorksDigest,
  CustomerWaitlistConfirmation,

  // Re-engagement
  ArtistInactive14d,
  ArtistInactive30d,
  ArtistInactive90d,
  VenueInactive30d,
  VenueInactive90dWhiteGlove,
  CustomerInactive30d,
  CustomerInactive90d,
  UserRepermissionCampaign,

  // Newsletter
  NewsletterMonthlyGallery,
  NewsletterSubscribeConfirm,
  NewsletterArtistSpotlight,
  NewsletterVenueSpotlight,
  NewsletterCuratorsPicks,
  NewsletterLocalArtNearYou,

  // Legal / operational
  LegalTermsUpdate,
  LegalPrivacyUpdate,
  ArtistTaxDocumentReady,
  OperationalPlatformIncident,
  OperationalPolicyViolationWarning,
  OperationalAccountRestricted,
  OperationalAccountRestored,
];

export function findTemplate(id: string): TemplateEntry | undefined {
  return EMAIL_REGISTRY.find((t) => t.id === id);
}
