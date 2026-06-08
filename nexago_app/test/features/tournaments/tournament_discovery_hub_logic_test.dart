import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_hub_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  group('tournament_discovery_hub_logic', () {
    test('filterTournamentsByQuery matches name/city/location', () {
      final items = <DiscoveryTournament>[
        DiscoveryTournament(
          id: 't1',
          name: 'Open Goiânia Beach',
          location: 'Arena ErreJota',
          city: 'Goiânia GO',
          dateLabel: '28/03 – 30/03',
          startDate: DateTime(2026, 3, 28),
          categories: const [TournamentGenderCat.f],
          format: TournamentFormat.dupla,
          priceLabel: 'R\$ 180',
          priceValue: 180,
          spotsLeft: 10,
          spotsTotal: 32,
          status: TournamentListingStatus.open,
          featured: false,
          enrolledCount: 0,
          liveMatchesNow: 0,
        ),
        DiscoveryTournament(
          id: 't2',
          name: 'Circuito Universitário',
          location: 'UFG Campus 2',
          city: 'Goiânia GO',
          dateLabel: '14/04 – 15/04',
          startDate: DateTime(2026, 4, 14),
          categories: const [TournamentGenderCat.mix],
          format: TournamentFormat.dupla,
          priceLabel: 'R\$ 60',
          priceValue: 60,
          spotsLeft: 4,
          spotsTotal: 16,
          status: TournamentListingStatus.scheduled,
          featured: false,
          enrolledCount: 0,
          liveMatchesNow: 0,
        ),
      ];

      expect(filterTournamentsByQuery(items, 'goiânia').length, 2);
      expect(filterTournamentsByQuery(items, 'ufg').single.id, 't2');
      expect(filterTournamentsByQuery(items, 'open').single.id, 't1');
    });

    test('filterLeaguesByQuery matches name/city/season', () {
      final leagues = <DiscoveryLeague>[
        DiscoveryLeague(
          id: 'l1',
          name: 'Copa Goiás Beach 2026',
          city: 'GO/DF',
          seasonLabel: 'Fev – Out 2026',
          stages: const [],
        ),
        DiscoveryLeague(
          id: 'l2',
          name: 'Liga Universitária Centro-Oeste',
          city: 'GO · MT · MS · DF',
          seasonLabel: 'Mar – Nov 2026',
          stages: const [],
        ),
      ];

      expect(filterLeaguesByQuery(leagues, 'universitária').single.id, 'l2');
      expect(filterLeaguesByQuery(leagues, '2026').length, 2);
      expect(filterLeaguesByQuery(leagues, 'go/df').single.id, 'l1');
    });

    test('registeredCategoriesByTournament groups category ids', () {
      final regs = <MyTournamentRegistration>[
        const MyTournamentRegistration(
          registrationId: 'r1',
          tournamentId: 't1',
          tournamentName: 'T1',
          dateLabel: '',
          statusLabel: 'Pago',
          isPaid: true,
          categoryId: 'cat-a',
        ),
        const MyTournamentRegistration(
          registrationId: 'r2',
          tournamentId: 't1',
          tournamentName: 'T1',
          dateLabel: '',
          statusLabel: 'Pago',
          isPaid: true,
          categoryId: 'cat-b',
        ),
      ];

      final map = registeredCategoriesByTournament(regs);
      expect(map['t1'], {'cat-a', 'cat-b'});
    });

    test('registrationsByTournamentId maps by tournamentId', () {
      final regs = <MyTournamentRegistration>[
        const MyTournamentRegistration(
          registrationId: 'r1',
          tournamentId: 't1',
          tournamentName: 'T1',
          dateLabel: '',
          statusLabel: 'Pago',
          isPaid: true,
          categoryId: 'cat',
        ),
      ];

      final map = registrationsByTournamentId(regs);
      expect(map['t1']?.registrationId, 'r1');
    });
  });
}

