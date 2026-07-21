import {initializeApp} from "firebase-admin/app";
import {setGlobalOptions} from "firebase-functions";

import {recalculateArenaReviewAggregates} from "./arena-review-aggregates";
import {quoteArenaBooking, createArenaBooking} from "./arena-booking-create";
import {
  cancelPendingArenaBookingPayment,
  createArenaBookingPixPayment,
  expirePendingArenaBookingPayments,
  requestArenaWithdrawal,
  listPendingArenaWithdrawals,
  reviewArenaWithdrawal,
} from "./arena-booking-pix";
import {createArenaSubscription, cancelArenaSubscription} from "./arena-subscription";
import {asaasWebhook} from "./asaas-webhook";
import {onArenaBookingCanceledNotifySlotVacancyAlerts} from "./slot-vacancy-alerts";
import {
  sendTournamentPartnerInvite,
  acceptTournamentPartnerInvite,
  cancelTournamentPartnerInvite,
  cancelTournamentRegistration,
  registerSoloTournament,
  setRegistrationUniform,
} from "./tournament-partner-invite";
import {
  createTournamentRegistrationPixPayment,
  cancelPendingTournamentRegistrationPix,
  confirmFreeTournamentRegistration,
  reserveDirectOrganizerRegistration,
} from "./tournament-registration-pix";
import {onBookingInviteCreatedNotifyInvitee} from "./booking-invite-notify";
import {
  onUserSearchKeywordsSync,
  onTournamentSearchKeywordsSync,
  onLegacyTournamentSearchKeywordsSync,
  onLeagueSearchKeywordsSync,
  onTeamSearchKeywordsSync,
  backfillSearchKeywords,
} from "./search-keywords-sync";
import {onTournamentMatchCompletedAwardXp} from "./tournament-match-gamification";
import {onArenaFavoriteCreatedAwardXp} from "./arena-favorite-gamification";
import {syncProfileCompletionRewards, onUserProfileUpdatedSyncGamification} from "./profile-completion-gamification";
import {syncAchievements} from "./achievement-engine";
import {completeDailyMission, recordProfileShare} from "./daily-mission-gamification";
import {processCompletedGame} from "./game-completed-gamification";
import {onBookingInviteAcceptedAwardInviterXp} from "./player-invite-gamification";
import {onArenaBookingAttendanceWrittenSyncGamification} from "./booking-attendance-gamification";
import {onArenaReviewCreatedAwardXp} from "./arena-review-gamification";
import {
  generateCategoryBracket,
  organizerConfirmRegistrationPayment,
  organizerMoveToWaitlist,
  organizerRemoveFromCategory,
  sendCategoryCommunication,
  resendRegistrationPayment,
  closeTournamentRegistrations,
  cancelTournament,
} from "./organizer-category-ops";
import {
  scheduleMatch,
  rescheduleMatch,
  unscheduleMatch,
  autoScheduleTournamentDay,
  callMatchToCourt,
  releaseMatchAfterCheckIn,
  declareMatchWalkover,
  submitMatchResult,
  validateMatchResult,
  advanceBracketWinner,
  applyLeagueRankingForMatch,
  onTournamentMatchCompletedAdvance,
} from "./organizer-match-ops";
import {deleteOwnAccount} from "./account-deletion";
import {onTournamentInscriptionWriteSyncCollectedCents} from "./tournament-collected-stats";
import {
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
} from "./arena-recurring-booking";
import {materializeArenaRecurringBookings} from "./arena-recurring-materializer";

export {
  onArenaCourtCreatedCountUp,
  onArenaCourtDeletedCountDown,
  backfillArenaCourtsCount,
} from "./arena-courts-count";

export {finalizeLapsedArenaPlans} from "./arena-plan-sweeper";

export {
  onTournamentStaffWrittenSyncMirror,
  onTournamentDeletedCleanupStaff,
} from "./tournament-staff-sync";

export {onTournamentWrittenCommunityFeed} from "./community-feed";

export {
  onUserWrittenSyncPublicProfile,
  backfillPublicProfiles,
} from "./public-profile-sync";

export {getTournamentAthleteContacts} from "./tournament-contacts";

export {
  setOrganizerPayoutPixKey,
  requestOrganizerWithdrawal,
  listPendingOrganizerWithdrawals,
  reviewOrganizerWithdrawal,
} from "./organizer-withdrawal";

export {
  quoteArenaBooking,
  createArenaBooking,
  cancelPendingArenaBookingPayment,
  createArenaBookingPixPayment,
  expirePendingArenaBookingPayments,
  requestArenaWithdrawal,
  listPendingArenaWithdrawals,
  reviewArenaWithdrawal,
  createArenaSubscription,
  cancelArenaSubscription,
  asaasWebhook,
  onArenaBookingCanceledNotifySlotVacancyAlerts,
  sendTournamentPartnerInvite,
  acceptTournamentPartnerInvite,
  cancelTournamentPartnerInvite,
  cancelTournamentRegistration,
  registerSoloTournament,
  setRegistrationUniform,
  createTournamentRegistrationPixPayment,
  cancelPendingTournamentRegistrationPix,
  confirmFreeTournamentRegistration,
  reserveDirectOrganizerRegistration,
  onBookingInviteCreatedNotifyInvitee,
  onUserSearchKeywordsSync,
  onTournamentSearchKeywordsSync,
  onLegacyTournamentSearchKeywordsSync,
  onLeagueSearchKeywordsSync,
  onTeamSearchKeywordsSync,
  backfillSearchKeywords,
  onTournamentMatchCompletedAwardXp,
  onArenaFavoriteCreatedAwardXp,
  syncProfileCompletionRewards,
  onUserProfileUpdatedSyncGamification,
  syncAchievements,
  completeDailyMission,
  recordProfileShare,
  processCompletedGame,
  onBookingInviteAcceptedAwardInviterXp,
  onArenaBookingAttendanceWrittenSyncGamification,
  onArenaReviewCreatedAwardXp,
  generateCategoryBracket,
  organizerConfirmRegistrationPayment,
  organizerMoveToWaitlist,
  organizerRemoveFromCategory,
  sendCategoryCommunication,
  resendRegistrationPayment,
  closeTournamentRegistrations,
  cancelTournament,
  scheduleMatch,
  rescheduleMatch,
  unscheduleMatch,
  autoScheduleTournamentDay,
  callMatchToCourt,
  releaseMatchAfterCheckIn,
  declareMatchWalkover,
  submitMatchResult,
  validateMatchResult,
  advanceBracketWinner,
  applyLeagueRankingForMatch,
  onTournamentMatchCompletedAdvance,
  deleteOwnAccount,
  onTournamentInscriptionWriteSyncCollectedCents,
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
  materializeArenaRecurringBookings,
};

// Rating engine + ranking global de torneios (Glicko-2 / promoção-rebaixamento)
export {
  onTournamentMatchCompletedUpdateRatings,
  onUserWrittenTrackLevelChanges,
  evaluateRatingLadderDaily,
  recomputeAthleteRating,
  backfillRatingsAndResults,
  migrateAthleteLevels,
} from "./rating-triggers";
export {onTournamentMatchCompletedAwardGlobalPoints} from "./tournament-ranking";

// Initialize Firebase Admin
initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({maxInstances: 10});

export const onArenaReviewWriteRecalculateAggregates = recalculateArenaReviewAggregates;





export {
  setUserRole,
  addUserRole,
  removeUserRole,
  setUserRoles,
} from "./user-role-ops";


export {
  createOrganizer,
  createArena,
  listBackofficeUsers,
  clearMustChangePassword,
  getUserRole,
  setAthletePro,
} from "./user-account-ops";




export {
  getMercadoPagoStatus,
  getMercadoPagoAuthUrl,
  mercadopagoOAuthCallback,
  createMercadoPagoPreference,
  createArenaBookingMercadoPagoPayment,
  mercadopagoWebhook,
} from "./mercadopago-endpoints";

export {linkAuthenticatedUserProfile} from "./user-profile-link";

export {
  sendNotification,
  notifyArenaBookingCreated,
  sendBulkNotification,
  sendMatchReminders,
} from "./notification-endpoints";

export {elevateToAdmin} from "./admin-ops";

export {submitContactMessageSecure} from "./contact-messages";

export {onArenaReviewCreatedNotifyManager} from "./arena-review-notify";
export {
  prepareArenaBookingReminder15m,
  sendArenaBookingReminders15m,
  sendArenaBookingReminders,
} from "./arena-booking-reminders";

export {
  sendFriendlyMatchInvite,
  acceptFriendlyMatchInviteSlot,
  declineFriendlyMatchInviteSlot,
  counterFriendlyMatchInvite,
  fillFriendlyMatchSlot,
  cancelFriendlyMatch,
} from "./friendly-match-invite";

export {
  expireFriendlyMatchSlots,
  unfillFriendlyMatches,
  sendFriendlyMatchReminders,
} from "./friendly-match-sweepers";

export {
  checkInFriendlyMatch,
  closeFriendlyMatchCheckIns,
} from "./friendly-match-checkin";

export {
  submitFriendlyMatchReview,
  revealFriendlyMatchReviews,
} from "./friendly-match-review";

export {
  onGamificationSummaryWrittenSyncSandRank,
  backfillSandRanks,
  equipSandRankCosmetic,
} from "./sand-rank-sync";

export {completeCoachSignup} from "./coach-signup";
export {completeArenaSignup} from "./arena-signup";
export {completeOrganizerSignup} from "./organizer-signup";

export {searchAthleteForCoachInvite} from "./coach-athlete-search";
export {
  sendCoachAthleteInvite,
  acceptCoachAthleteInvite,
  cancelCoachAthleteInvite,
} from "./coach-athlete-invite";
export {sendCallUp, respondToCallUp} from "./coach-call-up";

export {getCoachTournamentOverview} from "./coach-tournament-overview";

// --- Relatórios de ocupação de quadra (gestor de arena) ---
export {getArenaOccupancyReport} from "./arena-occupancy-report";
