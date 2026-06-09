import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';
import 'my_tournaments_models.dart';

/// Badge de destaque na Home para inscrição no dia do evento ou ao vivo.
bool registrationShowsAsLiveToday(MyTournamentRegistration registration) {
  if (registration.listingStatus == TournamentListingStatus.live) {
    return true;
  }
  final status = registration.listingStatus;
  if (status != null && isTournamentTerminal(status)) return false;
  final start = registration.startDate;
  if (start == null) return false;
  return isTournamentEventDay(
    startAt: start,
    endAt: registration.endDate,
  );
}

String registrationHomeBadgeLabel(MyTournamentRegistration registration) {
  if (registrationShowsAsLiveToday(registration)) {
    return registration.listingStatus == TournamentListingStatus.live
        ? 'AO VIVO'
        : 'DIA DO EVENTO';
  }
  return registration.statusLabel;
}

/// Ordena inscrições para preview da Home (evento hoje / ao vivo primeiro).
List<MyTournamentRegistration> sortRegistrationsForHomePreview(
  List<MyTournamentRegistration> registrations,
) {
  final copy = List<MyTournamentRegistration>.from(registrations);
  copy.sort((a, b) {
    final aLive = registrationShowsAsLiveToday(a);
    final bLive = registrationShowsAsLiveToday(b);
    if (aLive != bLive) return aLive ? -1 : 1;
    final aDate = a.startDate;
    final bDate = b.startDate;
    if (aDate != null && bDate != null) {
      return aDate.compareTo(bDate);
    }
    return a.tournamentName.compareTo(b.tournamentName);
  });
  return copy;
}

/// Monta enrollments a partir de inscrições + mapa de torneios.
List<MyTournamentEnrollment> buildMyTournamentEnrollments({
  required List<MyTournamentRegistration> registrations,
  required Map<String, DiscoveryTournament> tournamentsById,
}) {
  return registrations
      .map(
        (r) => MyTournamentEnrollment(
          registration: r,
          tournament: tournamentsById[r.tournamentId],
        ),
      )
      .toList();
}

/// Estado da página com listas derivadas.
MyTournamentsPageState buildMyTournamentsPageState({
  required List<MyTournamentEnrollment> enrollments,
  int? seasonYear,
}) {
  final year = seasonYear ?? DateTime.now().year;
  return MyTournamentsPageState(
    enrollments: enrollments,
    seasonYear: year,
  );
}

/// Separa em andamento vs concluídos.
({List<MyTournamentEnrollment> ongoing, List<MyTournamentEnrollment> completed})
    splitMyTournamentEnrollments(List<MyTournamentEnrollment> enrollments) {
  final ongoing = <MyTournamentEnrollment>[];
  final completed = <MyTournamentEnrollment>[];
  for (final e in enrollments) {
    if (e.isCompleted) {
      completed.add(e);
    } else {
      ongoing.add(e);
    }
  }
  return (ongoing: ongoing, completed: completed);
}

/// Ordena concluídos: data mais recente primeiro; sem data, por nome.
List<MyTournamentEnrollment> sortCompletedEnrollments(
  List<MyTournamentEnrollment> completed,
) {
  final copy = List<MyTournamentEnrollment>.from(completed);
  copy.sort((a, b) {
    final aDate = a.startDate;
    final bDate = b.startDate;
    if (aDate != null && bDate != null) {
      return bDate.compareTo(aDate);
    }
    if (aDate != null) return -1;
    if (bDate != null) return 1;
    return a.displayName.compareTo(b.displayName);
  });
  return copy;
}

/// Ordena em andamento: live primeiro, depois por data de início asc.
List<MyTournamentEnrollment> sortOngoingEnrollments(
  List<MyTournamentEnrollment> ongoing,
) {
  final copy = List<MyTournamentEnrollment>.from(ongoing);
  copy.sort((a, b) {
    if (a.isLive != b.isLive) return a.isLive ? -1 : 1;
    final aDate = a.startDate;
    final bDate = b.startDate;
    if (aDate != null && bDate != null) {
      return aDate.compareTo(bDate);
    }
    return a.displayName.compareTo(b.displayName);
  });
  return copy;
}

/// Filtro local por nome do torneio.
List<MyTournamentEnrollment> filterEnrollmentsByQuery(
  List<MyTournamentEnrollment> enrollments,
  String query,
) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return enrollments;
  return enrollments
      .where((e) => e.displayName.toLowerCase().contains(q))
      .toList();
}

/// Extrai ano da temporada a partir do label do ranking (ex. TEMPORADA 2026).
int resolveSeasonYear({int? rankingSeasonYear, String? rankingSeasonLabel}) {
  if (rankingSeasonYear != null && rankingSeasonYear > 2000) {
    return rankingSeasonYear;
  }
  final label = rankingSeasonLabel?.trim() ?? '';
  final match = RegExp(r'(20\d{2})').firstMatch(label);
  if (match != null) {
    return int.tryParse(match.group(1)!) ?? DateTime.now().year;
  }
  return DateTime.now().year;
}

Map<String, DiscoveryTournament> tournamentsById(
  List<DiscoveryTournament> tournaments,
) {
  return {for (final t in tournaments) t.id: t};
}

/// Torneios com inscrição aberta para sugestões no empty state.
List<DiscoveryTournament> pickOpenTournamentSuggestions(
  List<DiscoveryTournament> tournaments, {
  int limit = 3,
}) {
  if (tournaments.isEmpty || limit <= 0) return const [];

  final open = tournaments
      .where((t) => canRegisterForTournament(t.status))
      .toList();
  if (open.isEmpty) return const [];

  final sorted = [...open]..sort((a, b) {
      final featuredCmp = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      if (featuredCmp != 0) return featuredCmp;
      return a.startDate.compareTo(b.startDate);
    });

  return sorted.take(limit).toList();
}

String openTournamentSpotsPriceLabel(DiscoveryTournament tournament) {
  final spots = tournament.spotsLeft;
  final spotsLabel = spots == 1 ? '1 vaga' : '$spots vagas';
  final price = tournament.priceLabel.trim();
  if (price.isEmpty) return '• $spotsLabel';
  return '• $spotsLabel • $price';
}
