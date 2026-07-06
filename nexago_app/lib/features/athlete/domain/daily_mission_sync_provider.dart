import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../data/gamification_service.dart';
import 'booking_played_today.dart' show isDateKeyToday, isEligibleForPlayToday;
import 'gamification_models.dart';
import 'gamification_providers.dart';

/// IDs de reservas já processadas para gamificação nesta sessão.
final dailyMissionProcessedBookingsProvider =
    StateProvider<Set<String>>((ref) => <String>{});

/// Feedback pendente (sheet na home/shell).
final dailyMissionFeedbackProvider =
    StateProvider<GamificationFeedback?>((ref) => null);

/// Escuta reservas e dispara jogo concluído + missão Jogue 1x hoje.
final dailyMissionSyncProvider = Provider<void>((ref) {
  ref.listen(myBookingsStreamProvider, (previous, next) {
    final userId = ref.read(authProvider).valueOrNull?.uid;
    if (userId == null || userId.isEmpty) return;

    final bookings = next.valueOrNull;
    if (bookings == null) return;

    final now = DateTime.now();
    final service = ref.read(gamificationServiceProvider);
    var processed = ref.read(dailyMissionProcessedBookingsProvider);
    var hasEligiblePlayToday = false;

    for (final booking in bookings) {
      if (!isEligibleForPlayToday(booking, now)) continue;
      hasEligiblePlayToday = true;
      if (processed.contains(booking.id)) continue;
      processed = {...processed, booking.id};
      unawaited(
        _processEligibleBooking(
          ref: ref,
          userId: userId,
          bookingId: booking.id,
          now: now,
          service: service,
        ),
      );
    }

    ref.read(dailyMissionProcessedBookingsProvider.notifier).state = processed;

    if (hasEligiblePlayToday) {
      unawaited(
        _completePlayTodayMission(
          ref: ref,
          userId: userId,
          now: now,
          service: service,
        ),
      );
    }
  });
});

Future<void> _processEligibleBooking({
  required Ref ref,
  required String userId,
  required String bookingId,
  required DateTime now,
  required GamificationService service,
}) async {
  try {
    final feedback = await service.processCompletedGame(
      userId: userId,
      bookingId: bookingId,
    );
    if (feedback != null && feedback.xpGained > 0) {
      _enqueueFeedback(ref, feedback);
    }
  } catch (_) {
    // Firestore indisponível ou regras — não quebra o app.
  }
}

Future<void> _completePlayTodayMission({
  required Ref ref,
  required String userId,
  required DateTime now,
  required GamificationService service,
}) async {
  try {
    final feedback = await service.completeDailyMission(
      userId: userId,
      mission: GamificationMission.playToday,
    );
    if (feedback != null && feedback.xpGained > 0) {
      _enqueueFeedback(ref, feedback);
    }
  } catch (_) {}
}

void _enqueueFeedback(Ref ref, GamificationFeedback feedback) {
  if (ref.read(dailyMissionFeedbackProvider) == null) {
    ref.read(dailyMissionFeedbackProvider.notifier).state = feedback;
  }
}

/// Concede missão RESERVE_TODAY quando a reserva é para o dia corrente.
Future<void> tryAwardReserveTodayMission(
  WidgetRef ref, {
  required String dateKey,
}) async {
  final userId = ref.read(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) return;
  if (!isDateKeyToday(dateKey, DateTime.now())) return;

  try {
    final feedback = await ref.read(gamificationServiceProvider).onReserveToday(
          userId: userId,
        );
    if (feedback != null && feedback.xpGained > 0) {
      if (ref.read(dailyMissionFeedbackProvider) == null) {
        ref.read(dailyMissionFeedbackProvider.notifier).state = feedback;
      }
    }
  } catch (_) {}
}

final exploreTournamentMissionTrackedProvider =
    StateProvider<Set<String>>((ref) => <String>{});

/// Missão EXPLORE_TOURNAMENT ao abrir detalhe (uma vez por id por sessão).
Future<void> tryAwardExploreTournamentMission(
  WidgetRef ref, {
  required String listingId,
}) async {
  final userId = ref.read(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) return;

  final tracked = ref.read(exploreTournamentMissionTrackedProvider);
  if (tracked.contains(listingId)) return;
  ref.read(exploreTournamentMissionTrackedProvider.notifier).state = {
    ...tracked,
    listingId,
  };

  try {
    final feedback =
        await ref.read(gamificationServiceProvider).onExploreTournament(
              userId: userId,
            );
    if (feedback != null && feedback.xpGained > 0) {
      if (ref.read(dailyMissionFeedbackProvider) == null) {
        ref.read(dailyMissionFeedbackProvider.notifier).state = feedback;
      }
    }
  } catch (_) {}
}
