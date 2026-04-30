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
import ArtistPlacementRequestSent from "./templates/placements/ArtistPlacementRequestSent";
import ArtistPlacementAccepted from "./templates/placements/ArtistPlacementAccepted";
import VenuePlacementAcceptedConfirmation from "./templates/placements/VenuePlacementAcceptedConfirmation";
import ArtistPlacementDeclined from "./templates/placements/ArtistPlacementDeclined";
import PlacementVenueDeclinedArtistRequest from "./templates/placements/PlacementVenueDeclinedArtistRequest";
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
import MessageUnreadNotification from "./templates/messages/MessageUnreadNotification";
import MessageHourlyDigest from "./templates/messages/MessageHourlyDigest";
import ReviewPostedNotification from "./templates/messages/ReviewPostedNotification";
import OfferReceivedNotification from "./templates/messages/OfferReceivedNotification";

// ── Performance (artist) ──────────────────────────────────────────────────
import ArtistFirstQrScan from "./templates/performance/ArtistFirstQrScan";
import ArtistQrScanMilestone from "./templates/performance/ArtistQrScanMilestone";
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

// ── Orders ────────────────────────────────────────────────────────────────
import CustomerOrderReceipt from "./templates/orders/CustomerOrderReceipt";
import ArtistWorkSold from "./templates/orders/ArtistWorkSold";
import ArtistOrderConfirmation from "./templates/orders/ArtistOrderConfirmation";
import CustomerShippingConfirmation from "./templates/orders/CustomerShippingConfirmation";
import CustomerDeliveryConfirmation from "./templates/orders/CustomerDeliveryConfirmation";
import CustomerPostPurchaseCare from "./templates/orders/CustomerPostPurchaseCare";
import CustomerPurchaseReviewRequest from "./templates/orders/CustomerPurchaseReviewRequest";
import CustomerRefundConfirmation from "./templates/orders/CustomerRefundConfirmation";
import ArtistRefundNotification from "./templates/orders/ArtistRefundNotification";
import OrderDisputeOpened from "./templates/orders/OrderDisputeOpened";
import OrderDisputeResolved from "./templates/orders/OrderDisputeResolved";

// ── Payments ──────────────────────────────────────────────────────────────
import ArtistPayoutSent from "./templates/payments/ArtistPayoutSent";
import ArtistPayoutFailed from "./templates/payments/ArtistPayoutFailed";
import SubscriptionPaymentFailed from "./templates/payments/SubscriptionPaymentFailed";
import SubscriptionTrialEnding from "./templates/payments/SubscriptionTrialEnding";
import SubscriptionUpgraded from "./templates/payments/SubscriptionUpgraded";
import SubscriptionCancelled from "./templates/payments/SubscriptionCancelled";
import VenueRevenueShareStatement from "./templates/payments/VenueRevenueShareStatement";
import VenuePaidLoanInvoice from "./templates/payments/VenuePaidLoanInvoice";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EMAIL_REGISTRY: TemplateEntry<any>[] = [
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
  ArtistRefundNotification,
  OrderDisputeOpened,
  OrderDisputeResolved,

  // Payments
  ArtistPayoutSent,
  ArtistPayoutFailed,
  SubscriptionPaymentFailed,
  SubscriptionTrialEnding,
  SubscriptionUpgraded,
  SubscriptionCancelled,
  VenueRevenueShareStatement,
  VenuePaidLoanInvoice,
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
