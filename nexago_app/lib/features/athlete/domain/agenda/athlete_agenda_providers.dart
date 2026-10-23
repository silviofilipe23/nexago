import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../arenas/domain/arena_club_providers.dart';
import '../../../arenas/domain/my_bookings_providers.dart';
import '../../../athlete_training/application/athlete_training_providers.dart'
    show athleteCenterTrialsProvider;
import '../../../../core/auth/auth_providers.dart';
import '../../../../core/formatting/app_date_format.dart';
import '../../../friendly_match/domain/friendly_match_providers.dart';
import '../../../tournaments/domain/my_tournaments_providers.dart';
import '../../../tournaments/domain/tournament_partner_invite.dart';
import '../../../tournaments/domain/tournament_partner_invite_providers.dart';
import '../../data/class_agenda_repository.dart';
import '../../data/mock_athlete_agenda_data.dart';
import 'athlete_agenda_logic.dart';
import 'athlete_agenda_models.dart';
import 'class_agenda_entry.dart';
import 'class_charge_entry.dart';
import 'teacher_class_roster.dart';

/// Aulas da arena do atleta (aluno, encaixe ou professor) — `getMyClassAgenda`.
/// Falha vira lista vazia: a agenda segue com o resto.
final myClassAgendaProvider =
    FutureProvider.autoDispose<List<ClassAgendaEntry>>((ref) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return const [];
  try {
    return await ref.read(classAgendaRepositoryProvider).fetchMyClasses();
  } catch (_) {
    return const [];
  }
});

/// Aulas do atleta nos ~14 semanas até [dateKey] (`YYYY-MM-DD`, inclusivo) —
/// os números do story do treino (treino do mês e semanas seguidas). A agenda
/// só traz 30 dias para trás, pouco para uma sequência longa. Falha vira lista
/// vazia: o story sai com o que a agenda já tem.
final classStoryHistoryProvider = FutureProvider.autoDispose
    .family<List<ClassAgendaEntry>, String>((ref, dateKey) async {
  final day = parseBookingDateOnly(dateKey);
  if (day == null) return const [];
  final from = DateTime(
    day.year,
    day.month,
    day.day - (kMaxClassAgendaRangeDays - 2),
  );
  try {
    return await ref.read(classAgendaRepositoryProvider).fetchMyClassesInRange(
          fromKey: calendarDateKey(from),
          toKey: dateKey,
        );
  } catch (_) {
    return const [];
  }
});

/// Lista da chamada de uma aula que dou como professor
/// (`getMyClassSessionRoster`). Erro chega à tela com a mensagem do servidor.
final teacherClassRosterProvider = FutureProvider.autoDispose
    .family<TeacherClassRoster, String>((ref, sessionId) {
  return ref.watch(classAgendaRepositoryProvider).fetchTeacherRoster(sessionId);
});

/// Mensalidades de aula em aberto do atleta — `getMyClassCharges`.
/// Falha vira lista vazia: a agenda segue sem a seção.
final myClassChargesProvider =
    FutureProvider.autoDispose<List<ClassChargeEntry>>((ref) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return const [];
  try {
    return await ref.read(classAgendaRepositoryProvider).fetchMyCharges();
  } catch (_) {
    return const [];
  }
});

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
  final bookings = mergeOwnAndGuestBookings(
    ref.watch(myBookingsStreamProvider).valueOrNull ?? const [],
    ref.watch(myGuestBookingsStreamProvider).valueOrNull ?? const [],
  );
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

  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  final friendlyItems =
      (ref.watch(friendlyMatchActiveProvider).valueOrNull ?? const [])
          .map((m) => mapFriendlyMatchToAgendaItem(m, currentUid: uid))
          .toList();

  final clubItems =
      (ref.watch(myClubParticipationsProvider).valueOrNull ?? const [])
          .where((p) => p.isActive)
          .map(mapClubParticipationToAgendaItem)
          .whereType<AthleteAgendaItem>()
          .toList();

  final classItems = [
    ...(ref.watch(myClassAgendaProvider).valueOrNull ?? const [])
        .map(mapClassEntryToAgendaItem),
    // Experimentais pedidas em CTs (o atleta ainda não é aluno).
    ...(ref.watch(athleteCenterTrialsProvider).valueOrNull ?? const []).map(
      (t) => mapCenterTrialToAgendaItem(
        centerId: t.centerId,
        centerName: t.centerName,
        sessionId: t.sessionId,
        className: t.className,
        date: t.date,
        startTime: t.startTime,
        endTime: t.endTime,
        coachName: t.coachName,
        locationName: t.locationName,
        status: t.status,
      ),
    ),
  ].whereType<AthleteAgendaItem>().toList();

  final allItems = mergeAgendaItems(
    bookings: rentalItems,
    tournaments: tournamentItems,
    challenges: const [],
    friendlyMatches: friendlyItems,
    clubSessions: clubItems,
    classSessions: classItems,
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
  final bookings = mergeOwnAndGuestBookings(
    ref.watch(myBookingsStreamProvider).valueOrNull ?? const [],
    ref.watch(myGuestBookingsStreamProvider).valueOrNull ?? const [],
  );

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
