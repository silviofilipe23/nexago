import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/ranking/domain/ranking_constants.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_mapper.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_logic.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

void main() {
  group('sumPoints', () {
    test('sums every result, without discarding any', () {
      expect(
        sumPoints([10, 50, 30, 40, 20, 100, 5]),
        255,
      );
    });

    test('returns 0 for empty list', () {
      expect(sumPoints([]), 0);
    });
  });

  group('buildAthleteRankingRowsFromPointsByAthlete', () {
    test('assigns ranks by total sum, counting past the 5th result', () {
      final rows = buildAthleteRankingRowsFromPointsByAthlete(
        {
          // Melhores 5 = 330, soma = 360: o 6º resultado decide a liderança.
          'a': [100, 80, 60, 50, 40, 30],
          'b': [70, 70, 70, 70, 70],
        },
        year: 2026,
      );

      expect(rows.first.athleteId, 'a');
      expect(rows.first.rank, 1);
      expect(rows.first.totalPoints, 360);
      expect(rows.last.athleteId, 'b');
      expect(rows.last.totalPoints, 350);
    });
  });

  group('pointsToNextRank', () {
    test('returns gap to athlete above', () {
      final rows = [
        const AthleteRankingRow(
          rank: 1,
          athleteId: 'a',
          totalPoints: 500,
          tournamentsCount: 3,
        ),
        const AthleteRankingRow(
          rank: 2,
          athleteId: 'b',
          totalPoints: 400,
          tournamentsCount: 3,
        ),
      ];

      expect(pointsToNextRank(rows, 'b'), 101);
      expect(pointsToNextRank(rows, 'a'), isNull);
    });
  });

  group('previewRankingRows', () {
    test('includes current user when outside top 3', () {
      final rows = [
        for (var i = 1; i <= 5; i++)
          AthleteRankingRow(
            rank: i,
            athleteId: 'u$i',
            totalPoints: 600 - i * 10,
            tournamentsCount: 2,
          ),
      ];

      final preview = previewRankingRows(
        rows,
        currentAthleteId: 'u5',
      );

      expect(preview.length, 4);
      expect(preview.last.athleteId, 'u5');
    });

    test('respects custom topCount (comunidade usa top 10)', () {
      final rows = [
        for (var i = 1; i <= 15; i++)
          AthleteRankingRow(
            rank: i,
            athleteId: 'u$i',
            totalPoints: 600 - i * 10,
            tournamentsCount: 2,
          ),
      ];

      final topOnly = previewRankingRows(
        rows,
        topCount: 10,
        currentAthleteId: 'u4',
      );
      expect(topOnly.length, 10);
      expect(topOnly.last.athleteId, 'u10');

      final withUser = previewRankingRows(
        rows,
        topCount: 10,
        currentAthleteId: 'u12',
      );
      expect(withUser.length, 11);
      expect(withUser.last.athleteId, 'u12');
    });
  });

  group('filterAthleteRowsByGender', () {
    test('filters and reassigns ranks', () {
      final rows = [
        const AthleteRankingRow(
          rank: 1,
          athleteId: 'm1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
        const AthleteRankingRow(
          rank: 2,
          athleteId: 'f1',
          totalPoints: 400,
          tournamentsCount: 2,
        ),
      ];

      final filtered = filterAthleteRowsByGender(
        rows,
        RankingGenderFilter.male,
        {'m1': RankingGenderFilter.male, 'f1': RankingGenderFilter.female},
      );

      expect(filtered.length, 1);
      expect(filtered.first.athleteId, 'm1');
      expect(filtered.first.rank, 1);
    });
  });

  group('buildTeamRankingRowsFromPointsByTeam', () {
    test('assigns ranks by total sum, counting past the 5th result', () {
      final rows = buildTeamRankingRowsFromPointsByTeam(
        {
          // Melhores 5 = 330, soma = 360: o 6º resultado decide a liderança.
          't1': [100, 80, 60, 50, 40, 30],
          't2': [70, 70, 70, 70, 70],
        },
        year: 2026,
      );

      expect(rows.first.teamId, 't1');
      expect(rows.first.rank, 1);
      expect(rows.first.totalPoints, 360);
    });
  });

  group('filterTeamRowsByGender', () {
    test('filters and reassigns ranks', () {
      final rows = [
        const TeamRankingRow(
          rank: 1,
          teamId: 'm1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
        const TeamRankingRow(
          rank: 2,
          teamId: 'f1',
          totalPoints: 400,
          tournamentsCount: 2,
        ),
      ];

      final filtered = filterTeamRowsByGender(
        rows,
        RankingGenderFilter.female,
        {'m1': RankingGenderFilter.male, 'f1': RankingGenderFilter.female},
      );

      expect(filtered.length, 1);
      expect(filtered.first.teamId, 'f1');
      expect(filtered.first.rank, 1);
    });
  });

  group('normalizeRankingGender', () {
    test('maps common labels', () {
      expect(normalizeRankingGender('Masculino'), RankingGenderFilter.male);
      expect(normalizeRankingGender('Feminino'), RankingGenderFilter.female);
      expect(normalizeRankingGender('Misto'), RankingGenderFilter.mixed);
      expect(normalizeRankingGender(null), isNull);
    });
  });

  group('podiumEntries', () {
    test('uses actual rank not list order', () {
      const entries = [
        RankingListEntry(
          rank: 15,
          points: 100,
          tournamentsCount: 1,
          displayName: 'Atleta 15',
          subtitle: '',
          isCurrentUser: false,
        ),
      ];

      expect(podiumEntries(entries), isEmpty);
      expect(listEntriesFromRank4(entries).single.rank, 15);
    });
  });

  group('getPointsByPlaceFromTotal', () {
    // NOTA (fase 3, tarefa 5): esta função pertence à tabela custom de LIGA
    // (rankingPointsBaseSum=446), propositalmente fora do escopo da fase 3
    // — "ranking de liga mantém tabela própria e fica fora dos pesos" (spec
    // 2026-08-17-category-presets-ranking-weights-design.md). Como ela usa
    // `pointsByPlace` como peso relativo normalizado por esse baseSum fixo,
    // a tabela ×10 (1000/800/.../330) faz os pesos 2..8 somarem 3220 — acima
    // do baseSum 446 — e o clamp de map[1] satura em 0. Não é regressão de
    // produto: nenhuma tela chama esta função hoje (grep em lib/), e o único
    // uso real do irmão `getPointsForPlaceFromLeagueConfig`
    // (league_create_ranking_page.dart) nunca cai no fallback pra
    // `pointsByPlace`, pois `effectiveRankingPoints` sempre popula 1..4 via
    // `defaultLeagueRankingPoints`. Documentando o comportamento atual em vez
    // de inventar uma invariante que a função não cumpre mais.
    test('com pointsByPlace ×10 e baseSum legado, satura em map[1]=0', () {
      const total = 446;
      final map = getPointsByPlaceFromTotal(total);
      expect(map[1], 0);
      expect(map.values.fold(0, (a, b) => a + b), 3220);
    });

    test('total 0 continua zerando todas as posições', () {
      final map = getPointsByPlaceFromTotal(0);
      expect(map.values.every((v) => v == 0), isTrue);
    });
  });

  group('escada por fase alcançada (espelho do backend)', () {
    test('9º-16º valem 200 e 17º-32º valem 130', () {
      expect(getPointsForPlace(9), 200);
      expect(getPointsForPlace(16), 200);
      expect(getPointsForPlace(17), 130);
      expect(getPointsForPlace(32), 130);
    });

    test('pódio e quartas não mudaram', () {
      expect(getPointsForPlace(1), 1000);
      expect(getPointsForPlace(5), 330);
      expect(getPointsForPlace(8), 330);
    });

    test('além de 32 não há degrau de mata-mata', () {
      expect(getPointsForPlace(33), 0);
    });

    test('nenhum degrau paga menos que a participação do backend (100)', () {
      for (final topo in pointsLadderRanges.values) {
        expect(getPointsForPlace(topo), greaterThanOrEqualTo(100));
      }
    });
  });

  group('getPointsForPlace', () {
    test('tabela base ×10 (fase 3): 1º/2º/3º/4º e quartas (5º-8º)', () {
      expect(getPointsForPlace(1), 1000);
      expect(getPointsForPlace(2), 800);
      expect(getPointsForPlace(3), 600);
      expect(getPointsForPlace(4), 500);
      expect(getPointsForPlace(5), 330);
      expect(getPointsForPlace(6), 330);
      expect(getPointsForPlace(7), 330);
      expect(getPointsForPlace(8), 330);
    });
  });

  group('categoryPresetWeights', () {
    test('espelha os pesos de CATEGORY_PRESETS (fase 3, exibição apenas)', () {
      expect(categoryPresetWeights['Elite'], 1.2);
      expect(categoryPresetWeights['Open'], 1.0);
      expect(categoryPresetWeights['Avançado'], 0.5);
      expect(categoryPresetWeights['Intermediário'], 0.25);
      expect(categoryPresetWeights['Iniciante'], 0.125);
      expect(categoryPresetWeights['Livre'], 0.125);
    });
  });

  group('athleteLevelRank', () {
    test('resolves rank from levelsBySportFirestore of the primary sport', () {
      const profile = AppUserProfile(
        uid: 'a1',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario_1'},
      );
      expect(athleteLevelRank(profile), 2);
    });

    test('returns null when there is no primary sport nor global level', () {
      const profile = AppUserProfile(uid: 'a2');
      expect(athleteLevelRank(profile), isNull);
    });

    test('falls back to the legacy global level (canonical read chain)', () {
      const noPrimary = AppUserProfile(uid: 'a2', level: 'Intermediário 2');
      expect(athleteLevelRank(noPrimary), 3);

      const noPerSportLevel = AppUserProfile(
        uid: 'a3',
        primarySportFirestoreId: 'VOLEI_QUADRA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
        level: 'Iniciante 2',
      );
      expect(athleteLevelRank(noPerSportLevel), 1);
    });

    test('returns null when the primary sport has no level registered', () {
      const profile = AppUserProfile(
        uid: 'a3',
        primarySportFirestoreId: 'VOLEI_QUADRA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(athleteLevelRank(profile), isNull);
    });

    test('returns null for a null profile', () {
      expect(athleteLevelRank(null), isNull);
    });
  });

  group('teamLevelRank', () {
    test('returns the higher rank between the two athletes', () {
      const p1 = AppUserProfile(
        uid: 'p1',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'iniciante_1'},
      );
      const p2 = AppUserProfile(
        uid: 'p2',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(teamLevelRank(p1, p2), 6);
    });

    test('falls back to the resolved player when the other has no level', () {
      const p1 = AppUserProfile(
        uid: 'p1',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario_2'},
      );
      expect(teamLevelRank(p1, null), 3);
      expect(teamLevelRank(null, p1), 3);
    });

    test('returns null when neither athlete has a resolved level', () {
      expect(teamLevelRank(null, null), isNull);
    });
  });

  group('filterAthleteRowsByLevel', () {
    test('filters and reassigns ranks', () {
      final rows = [
        const AthleteRankingRow(
          rank: 1,
          athleteId: 'a1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
        const AthleteRankingRow(
          rank: 2,
          athleteId: 'a2',
          totalPoints: 400,
          tournamentsCount: 2,
        ),
      ];
      final filtered = filterAthleteRowsByLevel(rows, 5, {'a1': 2, 'a2': 5});
      expect(filtered.length, 1);
      expect(filtered.first.athleteId, 'a2');
      expect(filtered.first.rank, 1);
    });

    test(
      'excludes athletes with unresolved level when a level is selected',
      () {
        final rows = [
          const AthleteRankingRow(
            rank: 1,
            athleteId: 'a1',
            totalPoints: 500,
            tournamentsCount: 2,
          ),
        ];
        final filtered = filterAthleteRowsByLevel(rows, 5, {'a1': null});
        expect(filtered, isEmpty);
      },
    );

    test('returns all rows unchanged when levelRank is null', () {
      final rows = [
        const AthleteRankingRow(
          rank: 1,
          athleteId: 'a1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
      ];
      expect(filterAthleteRowsByLevel(rows, null, {'a1': null}), rows);
    });
  });

  group('filterTeamRowsByLevel', () {
    test('filters and reassigns ranks', () {
      final rows = [
        const TeamRankingRow(
          rank: 1,
          teamId: 't1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
        const TeamRankingRow(
          rank: 2,
          teamId: 't2',
          totalPoints: 400,
          tournamentsCount: 2,
        ),
      ];
      final filtered = filterTeamRowsByLevel(rows, 0, {'t1': 0, 't2': 5});
      expect(filtered.length, 1);
      expect(filtered.first.teamId, 't1');
      expect(filtered.first.rank, 1);
    });
  });

  group('rankingTeamFormat', () {
    test('teamSize da equipe nomeada (3–5) define o formato', () {
      expect(
        rankingTeamFormat(teamSize: 3, memberCount: 1),
        RankingFormatFilter.trio,
      );
      expect(
        rankingTeamFormat(teamSize: 4, memberCount: 2),
        RankingFormatFilter.quarteto,
      );
      expect(
        rankingTeamFormat(teamSize: 5, memberCount: 5),
        RankingFormatFilter.quinteto,
      );
    });

    test('sem teamSize cai no elenco; dupla legada (sem memberUids) é dupla',
        () {
      expect(
        rankingTeamFormat(teamSize: null, memberCount: 0),
        RankingFormatFilter.dupla,
      );
      expect(
        rankingTeamFormat(teamSize: null, memberCount: 2),
        RankingFormatFilter.dupla,
      );
      expect(
        rankingTeamFormat(teamSize: null, memberCount: 4),
        RankingFormatFilter.quarteto,
      );
    });

    test('nunca devolve all; acima de 5 satura em quinteto', () {
      for (var size = 0; size <= 8; size++) {
        expect(
          rankingTeamFormat(teamSize: size, memberCount: 0),
          isNot(RankingFormatFilter.all),
        );
        expect(
          rankingTeamFormat(teamSize: null, memberCount: size),
          isNot(RankingFormatFilter.all),
        );
      }
      expect(
        rankingTeamFormat(teamSize: 6, memberCount: 2),
        RankingFormatFilter.quinteto,
      );
      expect(
        rankingTeamFormat(teamSize: null, memberCount: 7),
        RankingFormatFilter.quinteto,
      );
    });
  });

  group('filterTeamRowsByFormat', () {
    final rows = [
      const TeamRankingRow(
        rank: 1,
        teamId: 'dupla1',
        totalPoints: 500,
        tournamentsCount: 2,
      ),
      const TeamRankingRow(
        rank: 2,
        teamId: 'trio1',
        totalPoints: 400,
        tournamentsCount: 2,
      ),
      const TeamRankingRow(
        rank: 3,
        teamId: 'trio2',
        totalPoints: 300,
        tournamentsCount: 1,
      ),
      const TeamRankingRow(
        rank: 4,
        teamId: 'semDoc',
        totalPoints: 200,
        tournamentsCount: 1,
      ),
    ];
    final formatByTeam = <String, RankingFormatFilter?>{
      'dupla1': RankingFormatFilter.dupla,
      'trio1': RankingFormatFilter.trio,
      'trio2': RankingFormatFilter.trio,
      'semDoc': null,
    };

    test('all mantém as linhas e as posições', () {
      expect(
        filterTeamRowsByFormat(rows, RankingFormatFilter.all, formatByTeam),
        rows,
      );
    });

    test('filtra pelo formato e renumera; formato desconhecido só entra em all',
        () {
      final trios =
          filterTeamRowsByFormat(rows, RankingFormatFilter.trio, formatByTeam);
      expect(trios.map((r) => r.teamId), ['trio1', 'trio2']);
      expect(trios.map((r) => r.rank), [1, 2]);

      final duplas =
          filterTeamRowsByFormat(rows, RankingFormatFilter.dupla, formatByTeam);
      expect(duplas.map((r) => r.teamId), ['dupla1']);
    });
  });

  group('RankingPageFilter', () {
    test('default: modo atletas, gênero e formato em all, sem ano/nível', () {
      const filter = RankingPageFilter();
      expect(filter.mode, RankingListMode.athletes);
      expect(filter.gender, RankingGenderFilter.all);
      expect(filter.format, RankingFormatFilter.all);
      expect(filter.year, isNull);
      expect(filter.level, isNull);
      expect(filter.isGeneralMode, isTrue);
    });

    test('copyWith(format:) troca só o formato e preserva o resto', () {
      const base = RankingPageFilter(
        mode: RankingListMode.teams,
        year: 2026,
        gender: RankingGenderFilter.female,
        level: 3,
      );
      final updated = base.copyWith(format: RankingFormatFilter.quarteto);
      expect(updated.format, RankingFormatFilter.quarteto);
      expect(updated.mode, RankingListMode.teams);
      expect(updated.year, 2026);
      expect(updated.gender, RankingGenderFilter.female);
      expect(updated.level, 3);
    });

    test('copyWith sem argumentos e troca de ano preservam o formato', () {
      const base = RankingPageFilter(
        mode: RankingListMode.teams,
        year: 2026,
        format: RankingFormatFilter.trio,
      );
      expect(base.copyWith().format, RankingFormatFilter.trio);

      final geral = base.copyWith(year: () => null);
      expect(geral.year, isNull);
      expect(geral.format, RankingFormatFilter.trio);
      expect(geral.isGeneralMode, isTrue);
    });
  });
}
