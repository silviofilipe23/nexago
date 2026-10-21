// PRIMEIRO import, sempre: fixa região e teto antes de qualquer função ser definida.
import "./global-options";
import {initializeApp} from "firebase-admin/app";

import {recalculateArenaReviewAggregates} from "./arena-review-aggregates";
import {quoteArenaBooking, createArenaBooking} from "./arena-booking-create";
import {
  quoteArenaManualBooking,
  createArenaManualBooking,
} from "./arena-manual-booking";
import {
  cancelPendingArenaBookingPayment,
  createArenaBookingCardPayment,
  createArenaBookingPixPayment,
  expirePendingArenaBookingPayments,
  requestArenaWithdrawal,
  listPendingArenaWithdrawals,
  reviewArenaWithdrawal,
} from "./arena-booking-pix";
import {createArenaSubscription, cancelArenaSubscription} from "./arena-subscription";
import {asaasWebhook} from "./asaas-webhook";
import {asaasWithdrawalValidation} from "./asaas-withdrawal-validation";
import {onArenaBookingCanceledNotifySlotVacancyAlerts} from "./slot-vacancy-alerts";
import {onArenaBookingStatusChangedSyncSlotHold} from "./arena-booking-slot-release";
import {
  sendTournamentPartnerInvite,
  acceptTournamentPartnerInvite,
  cancelTournamentPartnerInvite,
  cancelTournamentRegistration,
  registerSoloTournament,
  setRegistrationUniform,
} from "./tournament-partner-invite";
import {
  claimExternalPartnerInvite,
  createExternalPartnerInvite,
} from "./tournament-external-invite";
import {
  createTournamentTeamRegistration,
  leaveTournamentTeamRegistration,
} from "./tournament-team-registration";
import {
  sendTournamentSubstitutionInvite,
  markSubstitutionInviteViewed,
  resendSubstitutionInvite,
} from "./tournament-substitution";
import {
  createTournamentRegistrationPixPayment,
  createTournamentRegistrationCardPayment,
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
// Sorteio ao Vivo — sessão, revelações e publicação da chave.
import {
  createDrawSession,
  updateDrawSessionConfig,
  updateDrawSessionSeeds,
  startDrawSession,
  drawNextReveal,
  clearRevealSpotlight,
  replaceRevealPhrase,
  publishDrawSession,
  voidDrawSession,
} from "./draw-sessions";
import {
  generateCategoryBracket,
  organizerConfirmRegistrationPayment,
  organizerRevertRegistrationPayment,
  organizerMoveToWaitlist,
  organizerRemoveFromCategory,
  sendCategoryCommunication,
  resendRegistrationPayment,
  closeTournamentRegistrations,
  cancelTournament,
} from "./organizer-category-ops";
import {
  organizerCreateTeamRegistration,
} from "./organizer-create-registration";
import {
  organizerGrantTournamentSpotPass,
  organizerRevokeTournamentSpotPass,
} from "./tournament-spot-pass-ops";
import {
  claimSpotPassLink,
  organizerCreateSpotPassLink,
  organizerRevokeSpotPassLink,
} from "./tournament-spot-pass-link";
import {
  scheduleMatch,
  rescheduleMatch,
  unscheduleMatch,
  updateMatchOpsSettings,
  autoScheduleTournamentDay,
  callMatchToCourt,
  releaseMatchAfterCheckIn,
  declareMatchWalkover,
  submitMatchResult,
  validateMatchResult,
  revertMatchToScheduled,
  advanceBracketWinner,
  applyLeagueRankingForMatch,
  onTournamentMatchCompletedAdvance,
} from "./organizer-match-ops";
import {
  kocStartRound,
  kocRegisterRally,
  kocUndoRally,
  kocSetClock,
  kocGoldenPoint,
  kocFinishRound,
  kocRemoveTeam,
} from "./koc-match-ops";
import {deleteOwnAccount} from "./account-deletion";
import {onTournamentInscriptionWriteSyncCollectedCents} from "./tournament-collected-stats";
import {onInscriptionWrittenLockLevels} from "./tournament-level-lock";
import {
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
  updateArenaRecurringBooking,
  pauseArenaRecurringBooking,
  resumeArenaRecurringBooking,
} from "./arena-recurring-booking";
import {materializeArenaRecurringBookings} from "./arena-recurring-materializer";

// Clubinho — jogo aberto com lista pública e PIX por sessão.
export {
  upsertArenaClub,
  setArenaClubStatus,
  createArenaClubSession,
  cancelArenaClubSession,
  addArenaClubParticipant,
  removeArenaClubParticipant,
} from "./arena-club";
export {materializeArenaClubSessions} from "./arena-club-materializer";
export {
  joinArenaClubSession,
  leaveArenaClubSession,
  expireArenaClubPendingPayments,
} from "./arena-club-join";

// Aulas — turmas e aulas avulsas com professor; bloqueiam a quadra na agenda.
export {
  upsertArenaClassTeacher,
  previewArenaClassSchedule,
  upsertArenaClass,
  setArenaClassStatus,
  scheduleArenaClassDate,
  cancelArenaClassSession,
  addArenaClassStudent,
  getArenaClassAthleteContact,
  removeArenaClassStudent,
  saveArenaClassAttendance,
} from "./arena-class";
export {materializeArenaClassSessions} from "./arena-class-materializer";
// Aulas fase 2 — planos, matrícula, mensalidades (cobrança manual), reposição e lista de espera.
export {
  upsertArenaClassPlan,
  saveArenaClassRules,
  previewArenaClassEnrollment,
  createArenaClassEnrollment,
  setArenaClassEnrollmentStatus,
  setArenaClassChargeStatus,
  generateArenaClassMonthlyCharges,
} from "./arena-class-billing";
export {
  addArenaClassExtra,
  removeArenaClassExtra,
  addArenaClassWaitlist,
  removeArenaClassWaitlist,
} from "./arena-class-makeup";
// Aulas fase 2b — repasse do professor (fechamento mensal e pagamento manual).
export {
  previewArenaClassPayouts,
  closeArenaClassPayout,
  setArenaClassPayoutStatus,
} from "./arena-class-payout";
// Aulas — lembrete por push 2h antes (alunos do dia e professor).
export {sendArenaClassReminders} from "./arena-class-reminders";
// Aulas — cobrança online pelo Asaas (worker do grupo + varredura).
export {onArenaClassAsaasPaymentWritten, reconcileArenaClassAsaasPayments} from "./asaas-class-billing";
// Aulas na agenda do atleta (leitura só por callable — as coleções de aula são da equipe).
export {getMyClassAgenda} from "./arena-class-athlete-agenda";
// Aulas pelo professor com vínculo ("Gerenciar as próprias aulas"): lista da chamada.
export {getMyClassSessionRoster} from "./arena-class-teacher";
export {shareClassStory} from "./class-story-share";
// Alunos, aluno e turmas do professor (app, modo Professor) — mesma régua da chamada.
export {getMyProfessorStudents} from "./professor-students";
export {onProfessorLessonCreated} from "./professor-lessons";
// Agenda do professor em outros apps (feed .ics com token).
export {configureProfessorCalendarFeed, professorCalendarFeed} from "./professor-calendar";
// Avaliação do aluno pelo professor (fundamentos, nota geral, foco).
export {deleteProfessorEvaluation, saveProfessorEvaluation} from "./professor-evaluations";
// Pedido de remarcação de particular pelo chat (D3).
export {requestLessonReschedule, respondLessonReschedule} from "./professor-lesson-reschedule";
// Plano de aula do professor (H1–H5) e a visão do aluno (H8).
export {deleteLessonPlan, getLessonStudents, rateLessonFeedback, saveLessonPlan, saveLessonReview} from "./professor-lesson-plans";
// Turma própria do professor independente com horário fixo de quadra (B10).
export {
  createProfessorOwnClass,
  endProfessorOwnClassCallable as endProfessorOwnClass,
  onProfessorRecurringSeriesChanged,
  previewProfessorOwnClass,
  setProfessorOwnClassStudents,
} from "./professor-own-classes";
// Disponibilidade do professor e aulas particulares agendadas pelo aluno (A10).
export {
  cancelPrivateLesson,
  getProfessorOpenSlots,
  requestPrivateLesson,
  respondPrivateLesson,
  saveProfessorAvailability,
} from "./professor-availability";
// Canal professor ↔ gestão da arena (D4) e comunicados da arena para os professores (F6).
export {markArenaProfessorNoticeRead, openArenaChannel, sendArenaProfessorNotice} from "./arena-professor-channel";
// Mensagens professor ↔ aluno e grupo da turma.
export {
  getMyProfessors,
  markConversationRead,
  openClassConversation,
  openProfessorConversation,
  openStudentConversation,
  sendConversationMessage,
} from "./professor-messages";
// Ganhos do professor de equipe: repasse pago pelo nexaGO + saque PIX.
export {
  getMyPendingClassPayouts,
  listPendingProfessorWithdrawals,
  payArenaClassPayoutViaNexago,
  requestProfessorWithdrawal,
  reviewProfessorWithdrawal,
  setProfessorPayoutPixKey,
} from "./professor-earnings";
// Comunicados do professor para os alunos (aviso, enquete, cancelamento, financeiro).
export {
  deleteProfessorNotice,
  previewProfessorNoticeAudience,
  professorNoticeScheduler,
  remindProfessorNotice,
  respondProfessorNotice,
  saveProfessorNotice,
  sendProfessorNotice,
} from "./professor-notices";
// Carteira do professor independente (subconta Asaas + cobrança com split).
export {
  archiveProfessorStudent,
  cancelProfessorCharge,
  createProfessorCharge,
  createProfessorPayoutAccount,
  generateProfessorMonthlyCharges,
  refreshProfessorPayoutAccountStatus,
  respondProfessorStudentInvite,
  stopProfessorRecurring,
  upsertProfessorPlan,
  upsertProfessorStudent,
} from "./professor-wallet";
export {
  createArenaClassLesson,
  getProfessorClassActions,
  moveArenaClassStudent,
  sendArenaClassNotice,
} from "./arena-class-professor-actions";
export {getMyClassCharges} from "./arena-class-athlete-charges";

export {
  onArenaCourtCreatedCountUp,
  onArenaCourtDeletedCountDown,
  backfillArenaCourtsCount,
} from "./arena-courts-count";

export {finalizeLapsedArenaPlans} from "./arena-plan-sweeper";

export {expirePendingTournamentRegistrations} from
  "./tournament-registration-hold-sweeper";

export {expireOpenTournamentRegistrationPixCharges} from
  "./tournament-registration-pix-expiry-sweeper";

export {
  onTournamentStaffWrittenSyncMirror,
  onTournamentDeletedCleanupStaff,
} from "./tournament-staff-sync";

export {onTournamentWrittenCommunityFeed} from "./community-feed";

export {
  onUserWrittenSyncPublicProfile,
  backfillPublicProfiles,
} from "./public-profile-sync";

export {
  getTournamentAthleteContacts,
  getTournamentOrganizerContact,
} from "./tournament-contacts";

export {
  requestRegistrationCancellation,
  respondRegistrationCancellationRequest,
} from "./tournament-cancellation-request-ops";

export {
  setOrganizerPayoutPixKey,
  requestOrganizerWithdrawal,
  loadOrganizerWalletView,
  listPendingOrganizerWithdrawals,
  reviewOrganizerWithdrawal,
} from "./organizer-withdrawal";

export {
  quoteArenaBooking,
  createArenaBooking,
  quoteArenaManualBooking,
  createArenaManualBooking,
  cancelPendingArenaBookingPayment,
  createArenaBookingCardPayment,
  createArenaBookingPixPayment,
  expirePendingArenaBookingPayments,
  requestArenaWithdrawal,
  listPendingArenaWithdrawals,
  reviewArenaWithdrawal,
  createArenaSubscription,
  cancelArenaSubscription,
  asaasWebhook,
  asaasWithdrawalValidation,
  onArenaBookingCanceledNotifySlotVacancyAlerts,
  onArenaBookingStatusChangedSyncSlotHold,
  createExternalPartnerInvite,
  claimExternalPartnerInvite,
  sendTournamentPartnerInvite,
  acceptTournamentPartnerInvite,
  cancelTournamentPartnerInvite,
  cancelTournamentRegistration,
  registerSoloTournament,
  setRegistrationUniform,
  createTournamentTeamRegistration,
  leaveTournamentTeamRegistration,
  sendTournamentSubstitutionInvite,
  markSubstitutionInviteViewed,
  resendSubstitutionInvite,
  createTournamentRegistrationPixPayment,
  createTournamentRegistrationCardPayment,
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
  createDrawSession,
  updateDrawSessionConfig,
  updateDrawSessionSeeds,
  startDrawSession,
  drawNextReveal,
  clearRevealSpotlight,
  replaceRevealPhrase,
  publishDrawSession,
  voidDrawSession,
  generateCategoryBracket,
  organizerConfirmRegistrationPayment,
  organizerRevertRegistrationPayment,
  organizerCreateTeamRegistration,
  organizerGrantTournamentSpotPass,
  organizerRevokeTournamentSpotPass,
  organizerCreateSpotPassLink,
  organizerRevokeSpotPassLink,
  claimSpotPassLink,
  organizerMoveToWaitlist,
  organizerRemoveFromCategory,
  sendCategoryCommunication,
  resendRegistrationPayment,
  closeTournamentRegistrations,
  cancelTournament,
  scheduleMatch,
  rescheduleMatch,
  unscheduleMatch,
  updateMatchOpsSettings,
  autoScheduleTournamentDay,
  callMatchToCourt,
  releaseMatchAfterCheckIn,
  declareMatchWalkover,
  submitMatchResult,
  validateMatchResult,
  revertMatchToScheduled,
  advanceBracketWinner,
  applyLeagueRankingForMatch,
  onTournamentMatchCompletedAdvance,
  kocStartRound,
  kocRegisterRally,
  kocUndoRally,
  kocSetClock,
  kocGoldenPoint,
  kocFinishRound,
  kocRemoveTeam,
  deleteOwnAccount,
  onTournamentInscriptionWriteSyncCollectedCents,
  onInscriptionWrittenLockLevels,
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
  updateArenaRecurringBooking,
  pauseArenaRecurringBooking,
  resumeArenaRecurringBooking,
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
  migrateAthleteRatingLevelRanks,
} from "./rating-triggers";
export {onTournamentMatchCompletedAwardGlobalPoints} from "./tournament-ranking";
export {backfillRankingsBySport} from "./ranking-by-sport-backfill";

// Initialize Firebase Admin
initializeApp();



export const onArenaReviewWriteRecalculateAggregates = recalculateArenaReviewAggregates;





export {
  setUserRole,
  addUserRole,
  removeUserRole,
  setUserRoles,
} from "./user-role-ops";

export {saveOrganizerRegistration} from "./organizer-registration";


export {
  createOrganizer,
  createArena,
  listBackofficeUsers,
  clearMustChangePassword,
  getUserRole,
  setAthletePro,
} from "./user-account-ops";

export {getAthleteLevelState, setAthleteLevel} from "./athlete-level-admin";




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

// Avaliação do torneio pelos atletas (spec 2026-10-01). O job sobe com a flag
// `appConfig/tournamentReviews.enabled` desligada — ver scripts/set-tournament-reviews-flag.js.
export {submitTournamentReview} from "./tournament-review-submit";
export {onTournamentReviewWritten} from "./tournament-review-derived";
export {onTournamentReviewCreatedAwardXp} from "./tournament-review-gamification";
export {tournamentReviewDailySweep} from "./tournament-review-sweep";

// Perfil público do organizador: espelho, números, seguidores e push "abriu inscrições".
// Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
export {
  onUserWrittenSyncOrganizerPublicProfile,
  onOrganizerRecordWrittenSyncVerified,
  onTournamentWrittenOrganizerStats,
  onOrganizerFollowerWritten,
  refreshOrganizerStatsDaily,
} from "./organizer-public-profile-sync";
export {
  onTournamentWrittenNotifyOrganizerFollowers,
  sendScheduledOrganizerFollowerPushes,
} from "./organizer-follower-push";

export {
  onGamificationSummaryWrittenSyncSandRank,
  backfillSandRanks,
  equipSandRankCosmetic,
} from "./sand-rank-sync";

export {saveLinkPageProfile, trackLinkPageEvent} from "./link-pages";

export {trackArenaContactClick} from "./arena-contact-leads";

export {completeCoachSignup} from "./coach-signup";
export {completeArenaSignup} from "./arena-signup";
export {geocodeAddress} from "./geocode-address";
export {
  inviteArenaStaff,
  acceptArenaStaffInvite,
  revokeArenaStaffInvite,
  updateArenaStaffRole,
  removeArenaStaff,
} from "./arena-staff-ops";
export {
  onArenaStaffWrittenSyncMirror,
  onArenaDeletedCleanupStaff,
  sweepExpiredArenaStaffInvites,
} from "./arena-staff-sync";
export {
  createArenaProfessorInvite,
  requestArenaProfessorLink,
  respondToArenaProfessorInvite,
  approveArenaProfessorRequest,
  rejectArenaProfessorRequest,
  suspendArenaProfessorLink,
  reactivateArenaProfessorLink,
  endArenaProfessorLink,
  cancelArenaProfessorLink,
  updateArenaProfessorPermissions,
} from "./arena-professor-links";
export {completeOrganizerSignup} from "./organizer-signup";
export {grantAthleteRole} from "./athlete-signup";
export {confirmPhoneVerification} from "./athlete-phone-verification";

export {searchAthleteForCoachInvite} from "./coach-athlete-search";
export {
  sendCoachAthleteInvite,
  acceptCoachAthleteInvite,
  cancelCoachAthleteInvite,
} from "./coach-athlete-invite";
export {sendCallUp, respondToCallUp} from "./coach-call-up";

export {getCoachTournamentOverview} from "./coach-tournament-overview";

export {
  createCoachStaffInvite,
  acceptCoachStaffInvite,
  revokeCoachStaffInvite,
  changeCoachStaffRole,
  removeCoachStaff,
  leaveCoachStaff,
} from "./coach-staff-ops";
export {
  onCoachStaffWrittenSyncMirror,
  onCoachDeletedCleanupStaff,
} from "./coach-staff-sync";

// Split de pagamento em reserva de quadra (PIX, multi-pagador).
export {
  splitArenaBookingPayment,
  expireArenaBookingPaymentShares,
} from "./arena-booking-split";
// Convidar jogadores para a reserva de quadra (direto, link, sair/remover, cancelamento).
export {
  inviteArenaBookingPlayers,
  getArenaBookingInviteLink,
  respondArenaBookingInvite,
  leaveArenaBooking,
  cancelArenaBookingInvite,
  onArenaBookingCanceledNotifyParticipants,
} from "./arena-booking-invite";
// Cashback do atleta: reservas de saldo de cobranças mortas e intenções pendentes (5 min).
export {expireCashbackHolds} from "./cashback-hold-sweeper";
// Cashback do atleta: liberar depois do evento, vencer e avisar (diária, 10h).
export {cashbackDailySweep} from "./cashback-daily-sweeper";
// Programa de indicação (referral): código = UID do atleta, recompensa em XP
// via gamificação (não existe carteira de atleta hoje).
export {
  registerReferral,
  onGamificationSummaryWrittenAwardReferralBonus,
} from "./athlete-referral";
// Cupom de marketing da arena (código digitável, validade, limite de uso —
// complementar às promoções automáticas já existentes).
export {
  createArenaCoupon,
  listArenaCoupons,
  deactivateArenaCoupon,
  updateArenaCoupon,
} from "./arena-coupons";
// --- Relatórios de ocupação de quadra (gestor de arena) ---
export {getArenaOccupancyReport} from "./arena-occupancy-report";
export {postTournamentAnnouncement} from "./tournament-announcements";
// Peça na quadra — atleta lança consumo direto no app numa comanda de
// arena já aberta pelo balcão (ver arena-comanda-app-orders.ts).
export {addAppOrderItem} from "./arena-comanda-app-orders";
// Head-to-head (confronto direto) — item #3 de
// docs/superpowers/specs/2026-07-20-cinco-features-concorrencia-design.md
export {getHeadToHeadRecord} from "./head-to-head";
// Placar ao vivo (games/sets do set em andamento) de partidas In Progress.
export {updateLiveMatchScore} from "./organizer-match-ops";
// Fan-out do placar ao vivo para quem segue a partida (tela bloqueada) —
// docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md
export {
  onMatchLiveScoreChanged,
  sweepStaleFollowedMatches,
} from "./match-live-follow-notify";
export {
  joinArenaBookingWaitlist,
  notifyArenaWaitlistOnSlotFreed,
  expireArenaBookingWaitlistEntries,
} from "./arena-booking-waitlist";
// ─── Palpites da torcida no chaveamento (feature #5, engajamento/gamificação) ───
export {
  submitBracketPrediction,
  onTournamentMatchCompletedScoreBracketPredictions,
} from "./tournament-predictions";
export {publishArenaSite, unpublishArenaSite} from "./arena-sites";

// NFS-e da arena (Fatia A) — emissão via Focus NFe, disparada pelo trigger
// quando o pedido nasce em `fiscalInvoices`.
export {
  saveArenaFiscalConfig,
  setArenaFiscalMode,
  getArenaFiscalRequirements,
} from "./fiscal/arena-fiscal-config";
export {onFiscalInvoiceRequested} from "./fiscal/invoice-processor";
export {fiscalIssuerWebhook} from "./fiscal/invoice-webhook";
export {emitActivationTestInvoice, onActivationTestInvoiceResolved} from "./fiscal/activation";
export {retryFiscalInvoice} from "./fiscal/invoice-retry";
export {
  getFinanceOverview,
  upsertPlatformCost,
  deletePlatformCost,
} from "./backoffice-finance";

// Catálogo da Loja: escrita só por callable (as rules negam escrita de cliente).
export {
  archiveStoreProduct,
  duplicateStoreProduct,
  saveStoreProduct,
  saveStoreProductPhotos,
  saveStoreProductVariations,
} from "./store-catalog-write";

// Loja: pontos de retirada nas arenas e regras de frete. Escrita só por callable.
export {
  saveStorePickupPoint,
  saveStoreShippingRules,
  setStorePickupPointActive,
  setStoreShippingModeActive,
} from "./store-pickup";

// Loja: cupons e descontos automáticos. Escrita só por callable.
export {
  endStoreCoupon,
  saveStoreCoupon,
  setStoreAutoDiscountActive,
  setStoreCouponPaused,
} from "./store-coupons";

// Loja: banners de campanha da vitrine. Escrita só por callable; o gatilho publica.
export {saveStoreCampaigns} from "./store-campaigns";

// NexaSquad: regras do programa de embaixadores, versionadas. Escrita só por callable.
export {saveSquadRules} from "./squad-rules";

// Planos de torneio v2 (pacotes por quadra) e cotas Sponsors, versionados. Escrita só por callable.
export {saveTournamentPlan, saveTournamentPlanRules, saveTournamentSponsors} from "./tournament-plans";

// Planos NexaGO pelo organizador: catálogo sem custo/margem, pedido de contratação por evento
// (congela o plano vigente) e cotas de patrocínio indicadas. Escrita só por callable.
export {
  getTournamentPlanCatalog,
  manageTournamentPlanContract,
  savePlanContractSponsor,
} from "./tournament-plan-contracts";

// Fila dos contratos de plano no backoffice: status (sinal/saldo marcados à mão), aprovação das
// logos das cotas e patrocinadores trazidos pela NexaGO. Escrita só por callable.
export {
  reviewPlanContractSponsorLogo,
  saveNexagoPlanContractSponsor,
  setTournamentPlanContractStatus,
} from "./tournament-plan-contracts-admin";

// NexaSquad: comissões dos embaixadores e repasse quinzenal. Escrita só por callable.
export {
  approveSquadPayout,
  cancelSquadCommission,
  reassignSquadCommission,
  setSquadCommissionHold,
} from "./squad-commissions";

// NexaSquad: atribuição por link/QR (portal/app) e conferência do código no checkout.
export {checkSquadCode, recordSquadAttribution} from "./squad-attribution";
// NexaSquad: inscrição removida cancela a comissão (pendente, liberada ou paga → ajuste).
export {onInscriptionDeletedCancelSquadCommissions} from "./squad-commission-lifecycle";
// NexaSquad: candidaturas, convites e aceite (tela 04) — time no backoffice, atleta no app/portal.
export {
  acceptSquadInvite,
  openSquadInvite,
  sendSquadInvite,
  submitSquadApplication,
  updateSquadApplication,
  updateSquadInvite,
} from "./squad-applications";
// NexaSquad: contrato do embaixador (tela 02: nível com aditivo, pausa, encerramento) e a varredura
// de hora em hora (lembretes/expiração de convite, convite agendado, fim de contrato, retorno de pausa).
export {acceptSquadAmendment, sweepSquadProgram, updateSquadContract} from "./squad-contracts";
// NexaSquad: o que o atleta vê no app/portal (ganhos, pontos, ranking e o convite com o pacote).
export {getMySquad, getSquadRanking, viewSquadInvite} from "./squad-athlete";
// NexaSquad: o que só o portal do atleta mostra ("Entrar no Squad", cadastros do funil, checklist).
export {getSquadPortalInfo} from "./squad-athlete-portal";
// NexaSquad: espelho público dos embaixadores (página "Conheça o Squad" do site, sem login).
export {
  onAthleteRankingWrittenSyncSquadPublic,
  onSquadAmbassadorWrittenSyncPublic,
  onUserWrittenSyncSquadPublic,
} from "./squad-public-sync";

// Loja: personalizados — configuração por produto (tela 11) e fila de arte (tela 10).
export {
  createStoreCustomBatch,
  reviewStoreCustomItem,
  saveStoreBlocklist,
  saveStoreCustomization,
} from "./store-custom";

// Loja: personalização pelo atleta (02b/02c) — nome conferido na lista de bloqueio e a linha
// personalizada do carrinho montada (e precificada) no servidor.
export {addStoreCustomItemToCart, checkStoreCustomName} from "./store-custom-cart";
export {
  createStoreOrder,
  expireStoreOrderPix,
  onStoreOrderWrittenSyncView,
  quoteStoreCheckout,
} from "./store-checkout-endpoints";

// Estoque da Loja: entrada (06a) e transferência (06b). Saldo só muda por aqui.
export {
  advanceStoreTransfer,
  confirmStockEntry,
  deleteStockDraft,
  saveStockEntryDraft,
  saveStoreTransfer,
} from "./store-stock-write";

// Trocas & devoluções da Loja (tela 09): status e estoque na mesma transação.
export {createStoreReturn, storeReturnAction} from "./store-returns-write";

// Pedidos da Loja (telas 02/03): status, estoque e reembolso pendente na mesma transação.
export {
  refundStoreOrder,
  resendStoreOrderNotice,
  saveStoreOrderNote,
  storeOrderAction,
  sweepExpiredStorePickups,
} from "./store-orders-write";

// Vitrine da Loja: espelho público do catálogo e da config, recalculado a cada escrita da fonte.
export {
  onStoreConfigWrittenSyncShowcase,
  onStoreCustomizationWrittenSyncShowcase,
  onStorePickupPointWrittenSyncShowcase,
  onStoreProductWrittenSyncShowcase,
} from "./store-showcase-sync";

// Avaliação da compra da Loja (06b/08b): publica a do comprador e refaz a nota do produto.
export {moderateStoreReview, onStoreOrderReviewWrittenSyncPublic, submitStoreOrderReview} from "./store-reviews-write";

// Placar do pós-jogo do aluguel: o dono salva, os adversários com conta confirmam ou contestam.
export {respondBookingResult, saveBookingResult, sweepBookingResults} from "./booking-result-write";

// Prévia de link (OG/Twitter Card) das rotas dinâmicas do site público — a SPA Angular não
// tem SSR, então bots de rede social são redirecionados aqui pelo .htaccess (por User-Agent).
export {siteOgPreview} from "./site-og-preview";
