import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'analytics_events.dart';

/// Cola fina sobre o [FirebaseAnalytics] com os eventos de funil do app.
class AnalyticsService {
  AnalyticsService(this._analytics);

  final FirebaseAnalytics _analytics;

  Future<void> logLogin(String method) =>
      _analytics.logLogin(loginMethod: method);

  Future<void> logSignUp(String method) =>
      _analytics.logSignUp(signUpMethod: method);

  Future<void> logOnboardingComplete() =>
      _analytics.logEvent(name: AnalyticsEvents.onboardingComplete);

  Future<void> logTournamentRegistrationStart({
    required String tournamentId,
    required String categoryId,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.tournamentRegistrationStart,
        parameters: tournamentRegistrationParams(
          tournamentId: tournamentId,
          categoryId: categoryId,
        ),
      );

  Future<void> logTournamentRegistrationPaymentInitiated({
    required String tournamentId,
    required String categoryId,
    String? amountType,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.tournamentRegistrationPaymentInitiated,
        parameters: tournamentRegistrationParams(
          tournamentId: tournamentId,
          categoryId: categoryId,
          amountType: amountType,
        ),
      );

  Future<void> logTournamentRegistrationConfirmed({
    required String tournamentId,
    required String categoryId,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.tournamentRegistrationConfirmed,
        parameters: tournamentRegistrationParams(
          tournamentId: tournamentId,
          categoryId: categoryId,
        ),
      );

  // --- Funil do Bora Jogar (match finder) ---

  Future<void> logFriendlyMatchBuilderOpened({String? source}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchBuilderOpened,
        parameters: friendlyMatchParams(source: source),
      );

  Future<void> logFriendlyMatchInviteSent({
    required String objective,
    required String sport,
    required bool hasArena,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchInviteSent,
        parameters: friendlyMatchParams(
          objective: objective,
          sport: sport,
          hasArena: hasArena,
        ),
      );

  Future<void> logFriendlyMatchInviteAccepted({required bool wasCounter}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchInviteAccepted,
        parameters: friendlyMatchParams(wasCounter: wasCounter),
      );

  Future<void> logFriendlyMatchCheckedIn() =>
      _analytics.logEvent(name: AnalyticsEvents.friendlyMatchCheckedIn);

  Future<void> logFriendlyMatchReviewSubmitted({required int stars}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchReviewSubmitted,
        parameters: friendlyMatchParams(stars: stars),
      );
}

final analyticsServiceProvider = Provider<AnalyticsService>(
  (ref) => AnalyticsService(FirebaseAnalytics.instance),
);
