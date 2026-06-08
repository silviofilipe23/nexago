import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../arenas/domain/my_bookings_providers.dart';
import '../../../../core/auth/auth_providers.dart';
import '../../../tournaments/domain/my_tournaments_providers.dart';
import '../../../tournaments/domain/tournament_partner_invite.dart';
import '../../../tournaments/domain/tournament_partner_invite_providers.dart';
import '../../data/mock_athlete_agenda_data.dart';
import 'athlete_agenda_logic.dart';
import 'athlete_agenda_models.dart';

class AthleteAgendaPageState {
  const AthleteAgendaPageState({
    required this.allItems,
    required this.summary,
    required this.filterCounts,
  });

  final List<AthleteAgendaItem> allItems;
  final AthleteAgendaDaySummary summary;
  final AthleteAgendaFilterCounts filterCounts;
}

final athleteAgendaItemsProvider =
    Provider.autoDispose<AthleteAgendaPageState>((ref) {
  final bookings =
      ref.watch(myBookingsStreamProvider).valueOrNull ?? const [];
  final enrollmentsState = ref.watch(myTournamentsPageStateProvider);
  final enrollments = enrollmentsState.valueOrNull?.enrollments ?? const [];

  final rentalItems = bookings
      .map(
        (b) => mapBookingToAgendaItem(
          b,
          currentAthleteUid: ref.watch(authProvider).valueOrNull?.uid,
        ),
      )
      .whereType<AthleteAgendaItem>()
      .toList();

  final tournamentItems = enrollments
      .map(mapTournamentEnrollmentToAgendaItem)
      .whereType<AthleteAgendaItem>()
      .toList();

  final allItems = mergeAgendaItems(
    bookings: rentalItems,
    tournaments: tournamentItems,
    challenges: const [],
  );

  return AthleteAgendaPageState(
    allItems: allItems,
    summary: buildDaySummary(allItems),
    filterCounts: countAgendaFilters(allItems),
  );
});

final athleteAgendaNeedsYouProvider =
    Provider.autoDispose<List<AthleteAgendaNeedsYouItem>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  final invites =
      ref.watch(pendingTournamentPartnerInvitesProvider).valueOrNull ??
          const <TournamentPartnerInvite>[];
  final bookings =
      ref.watch(myBookingsStreamProvider).valueOrNull ?? const [];

  final items = <AthleteAgendaNeedsYouItem>[...mockAgendaNeedsYouItems()];

  for (final invite in invites) {
    if (!invite.isPending || invite.isExpired) continue;
    if (uid.isNotEmpty &&
        invite.inviteeUid != uid &&
        invite.inviterUid != uid) {
      continue;
    }
    items.add(
      AthleteAgendaNeedsYouItem(
        id: 'invite-${invite.id}',
        kind: AthleteAgendaNeedsYouKind.partnerInvite,
        title: '${invite.inviterName} convidou você',
        subtitle: 'Torneio · dupla',
        meta: 'Responda antes do prazo',
        statusLabel: 'CONVITE PENDENTE',
        inviteId: invite.id,
      ),
    );
  }

  for (final booking in bookings) {
    if (booking.attendanceConfirmed) continue;
    if (booking.attendanceStatus != 'pending') continue;
    items.add(
      AthleteAgendaNeedsYouItem(
        id: 'booking-${booking.id}',
        kind: AthleteAgendaNeedsYouKind.bookingConfirmation,
        title: 'Confirmar dupla',
        subtitle: booking.arenaName,
        meta: '${booking.startTime} · ${booking.courtName ?? 'Quadra'}',
        statusLabel: 'PENDENTE',
        bookingId: booking.id,
      ),
    );
  }

  return items;
});
