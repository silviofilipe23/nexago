import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_competitions_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

DiscoveryTournament _tournament({
  required String id,
  required String name,
  required DateTime startDate,
  String city = 'Goiânia',
}) {
  return DiscoveryTournament(
    id: id,
    name: name,
    location: 'Arena',
    city: city,
    dateLabel: '28 mai',
    startDate: startDate,
    categories: const [TournamentGenderCat.m],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 100',
    priceValue: 100,
    spotsLeft: 10,
    spotsTotal: 20,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 0,
    liveMatchesNow: 0,
  );
}

DiscoveryLeague _league({
  required String id,
  required String name,
  List<String> tournamentIds = const [],
  DateTime? seasonStartAt,
  String? city,
}) {
  return DiscoveryLeague(
    id: id,
    name: name,
    city: city,
    seasonStartAt: seasonStartAt,
    stages: [
      DiscoveryLeagueStage(
        id: 's1',
        name: 'Etapa 1',
        order: 1,
        tournamentIds: tournamentIds,
      ),
    ],
  );
}

void main() {
  final now = DateTime(2026, 6, 10, 12);

  group('pickAthleteHomeCompetitionsPreview', () {
    test('mixes tournaments and leagues sorted by nearest future date', () {
      final preview = pickAthleteHomeCompetitionsPreview(
        tournaments: [
          _tournament(
            id: 't-far',
            name: 'Torneio distante',
            startDate: DateTime(2026, 7, 1),
          ),
          _tournament(
            id: 't-soon',
            name: 'Torneio próximo',
            startDate: DateTime(2026, 6, 12),
          ),
        ],
        leagues: [
          _league(
            id: 'l-mid',
            name: 'Liga do meio',
            tournamentIds: const [],
            seasonStartAt: DateTime(2026, 6, 15),
            city: 'Recife',
          ),
        ],
        limit: 5,
        now: now,
      );

      expect(preview, hasLength(3));
      expect(preview[0], isA<AthleteHomeTournamentItem>());
      expect(
        (preview[0] as AthleteHomeTournamentItem).tournament.id,
        't-soon',
      );
      expect(preview[1], isA<AthleteHomeLeagueItem>());
      expect((preview[1] as AthleteHomeLeagueItem).league.id, 'l-mid');
      expect(preview[2], isA<AthleteHomeTournamentItem>());
      expect(
        (preview[2] as AthleteHomeTournamentItem).tournament.id,
        't-far',
      );
    });

    test('respects limit of 5', () {
      final preview = pickAthleteHomeCompetitionsPreview(
        tournaments: [
          for (var i = 0; i < 6; i++)
            _tournament(
              id: 't$i',
              name: 'Torneio $i',
              startDate: DateTime(2026, 6, 11 + i),
            ),
        ],
        leagues: const [],
        limit: 5,
        now: now,
      );

      expect(preview, hasLength(5));
    });

    test('ignores leagues without resolvable date', () {
      final preview = pickAthleteHomeCompetitionsPreview(
        tournaments: const [],
        leagues: [
          _league(id: 'l-empty', name: 'Liga vazia'),
        ],
        limit: 5,
        now: now,
      );

      expect(preview, isEmpty);
    });

    test('puts upcoming competitions before past ones', () {
      final preview = pickAthleteHomeCompetitionsPreview(
        tournaments: [
          _tournament(
            id: 'past',
            name: 'Passado',
            startDate: DateTime(2026, 6, 1),
          ),
          _tournament(
            id: 'future',
            name: 'Futuro',
            startDate: DateTime(2026, 6, 20),
          ),
        ],
        leagues: const [],
        limit: 5,
        now: now,
      );

      expect(preview, hasLength(2));
      expect(
        (preview.first as AthleteHomeTournamentItem).tournament.id,
        'future',
      );
      expect(
        (preview.last as AthleteHomeTournamentItem).tournament.id,
        'past',
      );
    });

    test('uses nearest stage tournament date for leagues', () {
      final preview = pickAthleteHomeCompetitionsPreview(
        tournaments: [
          _tournament(
            id: 'stage-t',
            name: 'Etapa torneio',
            startDate: DateTime(2026, 6, 11),
          ),
        ],
        leagues: [
          _league(
            id: 'l-stage',
            name: 'Liga com etapa',
            tournamentIds: const ['stage-t'],
          ),
        ],
        limit: 5,
        now: now,
      );

      expect(preview, hasLength(2));
      final leagueItem = preview.firstWhere((i) => i is AthleteHomeLeagueItem)
          as AthleteHomeLeagueItem;
      expect(leagueItem.sortDate, DateTime(2026, 6, 11));
      expect(leagueItem.subtitle, 'Liga · Circuito');
    });
  });
}
