import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_helpers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

DiscoveryTournament _tournament({
  required String id,
  required String name,
  required DateTime startDate,
}) {
  return DiscoveryTournament(
    id: id,
    name: name,
    location: 'Arena',
    city: 'Goiânia',
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
  required List<String> tournamentIds,
}) {
  return DiscoveryLeague(
    id: id,
    name: name,
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

  group('sortDiscoveryTournamentsByDateProximity', () {
    test('lists upcoming tournaments by nearest start date first', () {
      final sorted = sortDiscoveryTournamentsByDateProximity(
        [
          _tournament(
            id: 'far',
            name: 'Far',
            startDate: DateTime(2026, 7, 1),
          ),
          _tournament(
            id: 'soon',
            name: 'Soon',
            startDate: DateTime(2026, 6, 12),
          ),
          _tournament(
            id: 'today',
            name: 'Today',
            startDate: DateTime(2026, 6, 10),
          ),
        ],
        now: now,
      );

      expect(sorted.map((t) => t.id), ['today', 'soon', 'far']);
    });

    test('puts past tournaments after upcoming ones', () {
      final sorted = sortDiscoveryTournamentsByDateProximity(
        [
          _tournament(
            id: 'past',
            name: 'Past',
            startDate: DateTime(2026, 6, 1),
          ),
          _tournament(
            id: 'future',
            name: 'Future',
            startDate: DateTime(2026, 6, 15),
          ),
        ],
        now: now,
      );

      expect(sorted.first.id, 'future');
      expect(sorted.last.id, 'past');
    });
  });

  group('sortDiscoveryLeaguesByDateProximity', () {
    test('orders leagues by nearest visible tournament date', () {
      final tournaments = [
        _tournament(
          id: 't1',
          name: 'T1',
          startDate: DateTime(2026, 6, 20),
        ),
        _tournament(
          id: 't2',
          name: 'T2',
          startDate: DateTime(2026, 6, 11),
        ),
      ];

      final sorted = sortDiscoveryLeaguesByDateProximity(
        [
          _league(id: 'l1', name: 'Later', tournamentIds: ['t1']),
          _league(id: 'l2', name: 'Sooner', tournamentIds: ['t2']),
        ],
        tournaments,
        now: now,
      );

      expect(sorted.map((l) => l.id), ['l2', 'l1']);
    });
  });
}
