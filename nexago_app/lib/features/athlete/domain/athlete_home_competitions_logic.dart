import '../../tournaments/domain/tournament_discovery_helpers.dart';
import '../../tournaments/domain/tournament_discovery_models.dart';

sealed class AthleteHomeCompetitionItem {
  const AthleteHomeCompetitionItem();

  DateTime get sortDate;
  String get title;
  String get subtitle;
  String? get imageUrl;
}

final class AthleteHomeTournamentItem extends AthleteHomeCompetitionItem {
  const AthleteHomeTournamentItem(this.tournament);

  final DiscoveryTournament tournament;

  @override
  DateTime get sortDate => tournament.startDate;

  @override
  String get title => tournament.name;

  @override
  String get subtitle => tournament.city;

  @override
  String? get imageUrl {
    final url = tournament.imageUrl?.trim();
    return url != null && url.isNotEmpty ? url : null;
  }
}

final class AthleteHomeLeagueItem extends AthleteHomeCompetitionItem {
  const AthleteHomeLeagueItem({
    required this.league,
    required this.sortDate,
  });

  final DiscoveryLeague league;
  @override
  final DateTime sortDate;

  @override
  String get title => league.name;

  @override
  String get subtitle {
    final city = league.city?.trim();
    if (city != null && city.isNotEmpty) return 'Liga · $city';
    final season = league.seasonLabel?.trim();
    if (season != null && season.isNotEmpty) return 'Liga · $season';
    return 'Liga · Circuito';
  }

  @override
  String? get imageUrl {
    final url = league.coverUrl?.trim();
    return url != null && url.isNotEmpty ? url : null;
  }
}

DateTime _dayStart(DateTime dt) => DateTime(dt.year, dt.month, dt.day);

int compareAthleteHomeCompetitionItems(
  AthleteHomeCompetitionItem a,
  AthleteHomeCompetitionItem b, {
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  final today = _dayStart(clock);
  final aStart = a.sortDate;
  final bStart = b.sortDate;
  final aPast = aStart.isBefore(today);
  final bPast = bStart.isBefore(today);

  if (!aPast && bPast) return -1;
  if (aPast && !bPast) return 1;
  if (!aPast && !bPast) {
    final cmp = aStart.compareTo(bStart);
    if (cmp != 0) return cmp;
    return a.title.toLowerCase().compareTo(b.title.toLowerCase());
  }

  final cmp = bStart.compareTo(aStart);
  if (cmp != 0) return cmp;
  return a.title.toLowerCase().compareTo(b.title.toLowerCase());
}

DateTime? _leagueSortDate(
  DiscoveryLeague league,
  Map<String, DiscoveryTournament> tournamentsById,
) {
  return discoveryLeagueNearestStartDate(league, tournamentsById) ??
      league.seasonStartAt;
}

/// Até [limit] competições (torneios + ligas) ordenadas pela data mais próxima.
List<AthleteHomeCompetitionItem> pickAthleteHomeCompetitionsPreview({
  required List<DiscoveryTournament> tournaments,
  required List<DiscoveryLeague> leagues,
  int limit = 5,
  DateTime? now,
}) {
  if (limit <= 0) return const [];

  final tournamentsById = {for (final t in tournaments) t.id: t};
  final items = <AthleteHomeCompetitionItem>[
    for (final tournament in tournaments)
      AthleteHomeTournamentItem(tournament),
    for (final league in leagues)
      if (_leagueSortDate(league, tournamentsById) case final date?)
        AthleteHomeLeagueItem(league: league, sortDate: date),
  ];

  items.sort(
    (a, b) => compareAthleteHomeCompetitionItems(a, b, now: now),
  );

  return items.take(limit).toList();
}
