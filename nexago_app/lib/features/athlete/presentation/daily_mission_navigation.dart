import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/athlete_booking_helpers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/booking_played_today.dart';
import '../domain/gamification_models.dart';
import 'booking_details_page.dart';

/// Navegação contextual para missões diárias incompletas.
void navigateForDailyMission(
  BuildContext context,
  WidgetRef ref,
  GamificationMission mission,
) {
  switch (mission) {
    case GamificationMission.playToday:
    case GamificationMission.reserveToday:
      ref.read(athleteShellTabIndexProvider.notifier).state =
          athleteShellReservarTabIndex;
      break;
    // case GamificationMission.inviteOnePlayer:
    //   _openInviteFlow(context, ref);
    //   break;
    case GamificationMission.favoriteArena:
      ref.read(athleteShellTabIndexProvider.notifier).state =
          athleteShellReservarTabIndex;
      showAppSnackBar(
        context,
        'Abra uma arena e toque no coração para favoritar.',
      );
      break;
    case GamificationMission.exploreTournament:
      ref.read(athleteShellTabIndexProvider.notifier).state =
          athleteShellCompeteTabIndex;
      break;
    case GamificationMission.shareProfile:
      ref.read(athleteShellTabIndexProvider.notifier).state =
          athleteShellProfileTabIndex;
      showAppSnackBar(context, 'Toque em compartilhar no topo do seu perfil.');
      break;
  }
}

void openInviteFromHome(BuildContext context, WidgetRef ref) {
  _openInviteFlow(context, ref);
}

void _openInviteFlow(BuildContext context, WidgetRef ref) {
  final bookings = ref.read(myBookingsStreamProvider).valueOrNull ?? [];
  final next = findNextAthleteBooking(bookings);
  if (next == null) {
    showAppSnackBar(
      context,
      'Reserve um horário primeiro para convidar jogadores.',
    );
    ref.read(athleteShellTabIndexProvider.notifier).state =
        athleteShellReservarTabIndex;
    return;
  }

  final start = parseBookingStartAt(next);
  final end = parseBookingEndAt(next);
  if (start == null) {
    ref.read(athleteShellTabIndexProvider.notifier).state = 1;
    return;
  }

  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => BookingDetailsPage(
        bookingId: next.id,
        arenaId: next.arenaId,
        arenaName: next.arenaName,
        courtName: next.courtName ?? '',
        startAt: start,
        endAt: end ?? start.add(const Duration(hours: 1)),
        status: next.rawStatus,
        confirmedParticipants: next.confirmedParticipants,
        amountReais: next.amountReais,
        paymentType: next.paymentType,
      ),
    ),
  );
}
