import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_helpers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

DiscoveryTournament _tournament({
  required String id,
  required String name,
  required DateTime startDate,
  TournamentFormat format = TournamentFormat.dupla,
  double priceValue = 100,
  List<TournamentGenderCat> categories = const [TournamentGenderCat.m],
  TournamentListingStatus status = TournamentListingStatus.open,
}) {
  return DiscoveryTournament(
    id: id,
    name: name,
    location: 'Arena',
    city: 'Goiânia',
    dateLabel: '28 mai',
    startDate: startDate,
    categories: categories,
    format: format,
    priceLabel: r'R$ 100',
    priceValue: priceValue,
    spotsLeft: 10,
    spotsTotal: 20,
    status: status,
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

  group('filterDiscoveryTournaments — filtro de formato', () {
    final tournaments = [
      _tournament(
        id: 'dupla',
        name: 'Dupla',
        startDate: DateTime(2026, 6, 15),
      ),
      _tournament(
        id: 'individual',
        name: 'Individual',
        startDate: DateTime(2026, 6, 15),
        format: TournamentFormat.individual,
      ),
    ];

    test('format null deixa passar todos os formatos', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
      );

      expect(result.map((t) => t.id), ['dupla', 'individual']);
    });

    test('format dupla exclui torneios individuais', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        format: TournamentFormat.dupla,
      );

      expect(result.map((t) => t.id), ['dupla']);
    });

    test('format individual exclui torneios de dupla', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        format: TournamentFormat.individual,
      );

      expect(result.map((t) => t.id), ['individual']);
    });
  });

  group('filterDiscoveryTournaments — filtro de data (dateFrom)', () {
    final dateFrom = DateTime(2026, 6, 10);
    final tournaments = [
      _tournament(
        id: 'antes',
        name: 'Antes',
        startDate: DateTime(2026, 6, 9),
      ),
      _tournament(
        id: 'mesmo-dia',
        name: 'Mesmo dia',
        startDate: DateTime(2026, 6, 10),
      ),
      _tournament(
        id: 'depois',
        name: 'Depois',
        startDate: DateTime(2026, 6, 20),
      ),
    ];

    test('dateFrom null deixa passar todas as datas', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
      );

      expect(result.map((t) => t.id), ['antes', 'mesmo-dia', 'depois']);
    });

    test('torneio que começa antes de dateFrom sai', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        dateFrom: dateFrom,
      );

      expect(result.map((t) => t.id), isNot(contains('antes')));
    });

    test('mesmo dia e depois ficam (semântica startDate.isBefore)', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        dateFrom: dateFrom,
      );

      expect(result.map((t) => t.id), ['mesmo-dia', 'depois']);
    });

    test('mesmo dia com horário fica quando dateFrom é início do dia', () {
      final result = filterDiscoveryTournaments(
        tournaments: [
          _tournament(
            id: 'manha',
            name: 'Manhã',
            startDate: DateTime(2026, 6, 10, 8, 30),
          ),
        ],
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        dateFrom: dateFrom,
      );

      expect(result.map((t) => t.id), ['manha']);
    });
  });

  group('filterDiscoveryTournaments — filtro de preço (priceMax)', () {
    final tournaments = [
      _tournament(
        id: 'gratuito',
        name: 'Gratuito',
        startDate: DateTime(2026, 6, 15),
        priceValue: 0,
      ),
      _tournament(
        id: 'no-teto',
        name: 'No teto',
        startDate: DateTime(2026, 6, 15),
        priceValue: 150,
      ),
      _tournament(
        id: 'caro',
        name: 'Caro',
        startDate: DateTime(2026, 6, 15),
        priceValue: 200,
      ),
    ];

    test('priceMax null deixa passar todos os preços', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
      );

      expect(result.map((t) => t.id), ['gratuito', 'no-teto', 'caro']);
    });

    test('preço acima do teto sai', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        priceMax: 150,
      );

      expect(result.map((t) => t.id), isNot(contains('caro')));
    });

    test('preço igual ao teto fica', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        priceMax: 150,
      );

      expect(result.map((t) => t.id), contains('no-teto'));
    });

    test('gratuito passa sempre, mesmo com teto zero', () {
      final result = filterDiscoveryTournaments(
        tournaments: tournaments,
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        priceMax: 0,
      );

      expect(result.map((t) => t.id), ['gratuito']);
    });
  });

  group('filterDiscoveryTournaments — combinação de filtros', () {
    test('format dupla + priceMax compõem (E lógico)', () {
      final result = filterDiscoveryTournaments(
        tournaments: [
          _tournament(
            id: 'dupla-barata',
            name: 'Dupla barata',
            startDate: DateTime(2026, 6, 15),
            priceValue: 80,
          ),
          _tournament(
            id: 'dupla-cara',
            name: 'Dupla cara',
            startDate: DateTime(2026, 6, 15),
            priceValue: 300,
          ),
          _tournament(
            id: 'individual-barato',
            name: 'Individual barato',
            startDate: DateTime(2026, 6, 15),
            format: TournamentFormat.individual,
            priceValue: 50,
          ),
        ],
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        format: TournamentFormat.dupla,
        priceMax: 100,
      );

      expect(result.map((t) => t.id), ['dupla-barata']);
    });

    test('filtros novos compõem com categoria e openOnly existentes', () {
      final result = filterDiscoveryTournaments(
        tournaments: [
          // Passa em tudo: feminino, aberto, dupla, no dia e no preço.
          _tournament(
            id: 'passa',
            name: 'Passa',
            startDate: DateTime(2026, 6, 15),
            categories: const [TournamentGenderCat.f],
          ),
          // Cai só na categoria (masculino).
          _tournament(
            id: 'masculino',
            name: 'Masculino',
            startDate: DateTime(2026, 6, 15),
          ),
          // Cai só no openOnly (encerrado).
          _tournament(
            id: 'encerrado',
            name: 'Encerrado',
            startDate: DateTime(2026, 6, 15),
            categories: const [TournamentGenderCat.f],
            status: TournamentListingStatus.ended,
          ),
          // Cai só no dateFrom (começa antes).
          _tournament(
            id: 'passado',
            name: 'Passado',
            startDate: DateTime(2026, 6, 1),
            categories: const [TournamentGenderCat.f],
          ),
          // Cai só no priceMax (acima do teto).
          _tournament(
            id: 'caro',
            name: 'Caro',
            startDate: DateTime(2026, 6, 15),
            categories: const [TournamentGenderCat.f],
            priceValue: 500,
          ),
        ],
        category: TournamentDiscoveryCategoryFilter.f,
        openOnly: true,
        format: TournamentFormat.dupla,
        dateFrom: DateTime(2026, 6, 10),
        priceMax: 150,
      );

      expect(result.map((t) => t.id), ['passa']);
    });
  });

  group('discoveryActiveFilterCount', () {
    test('retorna 0 quando tudo está no default', () {
      final count = discoveryActiveFilterCount(
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
      );

      expect(count, 0);
    });

    test('soma 1 quando só a categoria difere de "all"', () {
      final count = discoveryActiveFilterCount(
        category: TournamentDiscoveryCategoryFilter.f,
        openOnly: false,
      );

      expect(count, 1);
    });

    test('soma 1 quando só o formato está definido', () {
      final count = discoveryActiveFilterCount(
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        format: TournamentFormat.individual,
      );

      expect(count, 1);
    });

    test('soma 1 quando só dateFrom está definido', () {
      final count = discoveryActiveFilterCount(
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        dateFrom: DateTime(2026, 6, 10),
      );

      expect(count, 1);
    });

    test('soma 1 quando só priceMax está definido', () {
      final count = discoveryActiveFilterCount(
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: false,
        priceMax: 100,
      );

      expect(count, 1);
    });

    test('soma 1 quando só openOnly está ativo', () {
      final count = discoveryActiveFilterCount(
        category: TournamentDiscoveryCategoryFilter.all,
        openOnly: true,
      );

      expect(count, 1);
    });

    test('retorna 5 quando todos os filtros estão ativos', () {
      final count = discoveryActiveFilterCount(
        category: TournamentDiscoveryCategoryFilter.mix,
        openOnly: true,
        format: TournamentFormat.dupla,
        dateFrom: DateTime(2026, 6, 10),
        priceMax: 200,
      );

      expect(count, 5);
    });
  });
}
