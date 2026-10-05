import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/ranking/domain/ranking_logic.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

void main() {
  group('entradas do doc por esporte', () {
    test('dono vem do campo, não do id do doc ({id}_{CODE})', () {
      final entry = AthleteRankingEntry.fromBySportData('a1_BEACH_TENNIS', {
        'athleteId': 'a1',
        'sport': 'BEACH_TENNIS',
        'totalPoints': 800,
        'tournamentsCount': 2,
        'pointsByYear': {'2026': 500, '2025': 300},
      }, 'BEACH_TENNIS');
      expect(entry.athleteId, 'a1');
      expect(entry.totalPoints, 800);
      expect(entry.pointsByYear, {'2026': 500, '2025': 300});
    });

    test('sem o campo, tira o sufixo do esporte (código com "_")', () {
      final team = TeamRankingEntry.fromBySportData('t_9_VOLEI_PRAIA', {
        'totalPoints': 10,
      }, 'VOLEI_PRAIA');
      expect(team.teamId, 't_9');
    });
  });

  group('buildAthleteRankingRowsForPeriod', () {
    const entries = [
      AthleteRankingEntry(
        athleteId: 'a',
        totalPoints: 900,
        tournamentsCount: 3,
        pointsByYear: {'2025': 900},
      ),
      AthleteRankingEntry(
        athleteId: 'b',
        totalPoints: 500,
        tournamentsCount: 1,
        pointsByYear: {'2026': 500},
      ),
    ];

    test('geral: ordena pelo total', () {
      final rows = buildAthleteRankingRowsForPeriod(entries);
      expect(rows.map((r) => [r.rank, r.athleteId, r.totalPoints]), [
        [1, 'a', 900],
        [2, 'b', 500],
      ]);
    });

    test('temporada não mostra a contagem de torneios da carreira', () {
      final rows = buildAthleteRankingRowsForPeriod(entries, year: 2026);
      expect(rows.single.tournamentsCount, 0);
      expect(
        buildAthleteRankingRowsForPeriod(entries).first.tournamentsCount,
        3,
      );
    });

    test('temporada: pontos do ano; sem pontos no ano fica fora', () {
      final rows = buildAthleteRankingRowsForPeriod(entries, year: 2026);
      expect(rows.map((r) => [r.rank, r.athleteId, r.totalPoints]), [
        [1, 'b', 500],
      ]);
    });

    test('equipes seguem a mesma regra', () {
      const teams = [
        TeamRankingEntry(
          teamId: 't1',
          totalPoints: 100,
          tournamentsCount: 1,
          pointsByYear: {'2026': 100},
        ),
        TeamRankingEntry(
          teamId: 't2',
          totalPoints: 300,
          tournamentsCount: 2,
          pointsByYear: {'2025': 300},
        ),
      ];
      expect(
        buildTeamRankingRowsForPeriod(teams, year: 2026).map((r) => r.teamId),
        ['t1'],
      );
      expect(buildTeamRankingRowsForPeriod(teams).map((r) => r.teamId), [
        't2',
        't1',
      ]);
    });
  });

  group('nível no esporte do ranking', () {
    const profile = AppUserProfile(
      uid: 'a1',
      primarySportFirestoreId: 'BEACH_TENNIS',
      levelsBySportFirestore: {
        'BEACH_TENNIS': 'open',
        'VOLEI_PRAIA': 'intermediario_1',
      },
      level: 'Iniciante 2',
    );

    test('usa o do esporte; sem ele, o global (não o do principal)', () {
      expect(athleteLevelRankForSport(profile, 'VOLEI_PRAIA'), 2);
      expect(athleteLevelRankForSport(profile, 'BEACH_TENNIS'), 6);
      expect(athleteLevelRankForSport(profile, 'FUTEVOLEI'), 1);
      expect(athleteLevelRankForSport(null, 'FUTEVOLEI'), isNull);
    });

    test('dupla vale o integrante mais forte no esporte', () {
      const other = AppUserProfile(
        uid: 'a2',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'avancado_1'},
      );
      expect(teamLevelRankForSport(profile, other, 'VOLEI_PRAIA'), 4);
    });
  });

  group('esporte do ranking', () {
    test('opções = esportes de competição, por código de perfil', () {
      expect(rankingSportOptions.map((o) => o.profileCode), [
        'VOLEI_PRAIA',
        'VOLEI_QUADRA',
        'FUTEVOLEI',
        'TENIS',
        'BEACH_TENNIS',
      ]);
    });

    test('padrão = principal quando é de competição; senão vôlei de praia', () {
      expect(defaultRankingSport('FUTEVOLEI'), 'FUTEVOLEI');
      expect(defaultRankingSport('CORRIDA'), 'VOLEI_PRAIA');
      expect(defaultRankingSport(null), 'VOLEI_PRAIA');
    });

    test('rótulo do esporte', () {
      expect(rankingSportLabel('BEACH_TENNIS'), 'Beach tennis');
    });
  });

  group('posição por esporte do perfil público', () {
    test('só esportes com pontos no ano; posição do atleta em cada um', () {
      final ranks = athleteSportRanksFrom(
        athleteId: 'a1',
        year: 2026,
        ownDocsBySport: const {
          'BEACH_TENNIS': AthleteRankingEntry(
            athleteId: 'a1',
            totalPoints: 800,
            tournamentsCount: 2,
            pointsByYear: {'2026': 800},
          ),
          'VOLEI_PRAIA': AthleteRankingEntry(
            athleteId: 'a1',
            totalPoints: 300,
            tournamentsCount: 1,
            pointsByYear: {'2025': 300},
          ),
        },
        rowsBySport: const {
          'BEACH_TENNIS': [
            AthleteRankingRow(
              rank: 1,
              athleteId: 'x',
              totalPoints: 900,
              tournamentsCount: 3,
            ),
            AthleteRankingRow(
              rank: 2,
              athleteId: 'a1',
              totalPoints: 800,
              tournamentsCount: 2,
            ),
          ],
        },
      );
      expect(ranks, {'BEACH_TENNIS': 2});
    });

    test('sportsScoredInYear lista quem tem pontos no ano', () {
      expect(
        sportsScoredInYear(const {
          'BEACH_TENNIS': AthleteRankingEntry(
            athleteId: 'a1',
            totalPoints: 800,
            tournamentsCount: 2,
            pointsByYear: {'2026': 800},
          ),
          'FUTEVOLEI': AthleteRankingEntry(
            athleteId: 'a1',
            totalPoints: 0,
            tournamentsCount: 0,
          ),
        }, 2026),
        ['BEACH_TENNIS'],
      );
    });
  });
}
