import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_card_labels.dart';
import 'package:nexago_app/features/tournaments/domain/compete_hub_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentDiscoveryLiveStats _stats({int open = 0, int live = 0}) =>
    TournamentDiscoveryLiveStats(
      activeTournaments: open,
      matchesLiveNow: live,
      openRegistrations: open,
    );

CompeteHubUserRanking _ranked({
  int rank = 12,
  int points = 340,
  bool isSeasonMode = true,
}) =>
    CompeteHubUserRanking(
      rank: rank,
      seasonLabel: isSeasonMode ? 'TEMPORADA 2026' : 'RANKING GERAL',
      isSeasonMode: isSeasonMode,
      subtitle: '',
      points: points,
      tournamentsCount: 3,
    );

void main() {
  group('competeHubTournamentsCardDescription', () {
    test('sem dados ainda mostra o texto padrão do card', () {
      expect(
        competeHubTournamentsCardDescription(null),
        competeHubTournamentsFallbackDescription,
      );
    });

    test('conta inscrições abertas no plural', () {
      expect(
        competeHubTournamentsCardDescription(_stats(open: 3)),
        '3 com inscrições abertas',
      );
    });

    test('uma inscrição aberta fica no singular', () {
      expect(
        competeHubTournamentsCardDescription(_stats(open: 1)),
        '1 com inscrições abertas',
      );
    });

    test('jogos ao vivo entram junto das inscrições abertas', () {
      expect(
        competeHubTournamentsCardDescription(_stats(open: 2, live: 4)),
        '2 abertas · 4 jogos ao vivo',
      );
    });

    test('só jogos ao vivo, sem inscrição aberta', () {
      expect(
        competeHubTournamentsCardDescription(_stats(live: 1)),
        '1 jogo ao vivo agora',
      );
    });

    test('nada aberto nem ao vivo não promete competição aberta', () {
      final label = competeHubTournamentsCardDescription(_stats());
      expect(label, isNot(contains('abert')));
      expect(label, competeHubTournamentsIdleDescription);
    });
  });

  group('competeHubRankingCardDescription', () {
    test('sem dados ainda mostra o texto padrão do card', () {
      expect(
        competeHubRankingCardDescription(null),
        competeHubRankingFallbackDescription,
      );
    });

    test('atleta na temporada vê posição e pontos', () {
      expect(
        competeHubRankingCardDescription(_ranked()),
        '#12 na temporada · 340 pts',
      );
    });

    test('pontos usam separador de milhar brasileiro', () {
      expect(
        competeHubRankingCardDescription(_ranked(rank: 3, points: 1250)),
        '#3 na temporada · 1.250 pts',
      );
    });

    test('fora da temporada cai no ranking geral', () {
      expect(
        competeHubRankingCardDescription(
          _ranked(rank: 40, points: 90, isSeasonMode: false),
        ),
        '#40 no ranking geral · 90 pts',
      );
    });

    test('sem posição convida a jogar um torneio', () {
      final unranked = CompeteHubUserRanking.unranked(
        seasonYear: 2026,
        isSeasonMode: true,
      );
      expect(
        competeHubRankingCardDescription(unranked),
        'Jogue um torneio e entre no ranking',
      );
    });
  });
}
