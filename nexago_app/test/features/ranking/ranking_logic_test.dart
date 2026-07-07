import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/ranking/domain/ranking_constants.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_mapper.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_logic.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

void main() {
  group('sumBestNPoints', () {
    test('sums top 5 results', () {
      expect(
        sumBestNPoints([10, 50, 30, 40, 20, 100, 5]),
        240,
      );
    });

    test('returns 0 for empty list', () {
      expect(sumBestNPoints([]), 0);
    });
  });

  group('buildAthleteRankingRowsFromPointsByAthlete', () {
    test('assigns ranks by best N sum', () {
      final rows = buildAthleteRankingRowsFromPointsByAthlete(
        {
          'a': [100, 80, 60],
          'b': [90, 90, 90, 90, 90],
        },
        year: 2026,
      );

      expect(rows.first.athleteId, 'b');
      expect(rows.first.rank, 1);
      expect(rows.first.totalPoints, 450);
      expect(rows.last.athleteId, 'a');
      expect(rows.last.totalPoints, 240);
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
    test('assigns ranks by best N sum', () {
      final rows = buildTeamRankingRowsFromPointsByTeam(
        {
          't1': [100, 80],
          't2': [90, 90, 90, 90, 90],
        },
        year: 2026,
      );

      expect(rows.first.teamId, 't2');
      expect(rows.first.rank, 1);
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
    test('sums to total distributed', () {
      const total = 446;
      final map = getPointsByPlaceFromTotal(total);
      expect(map.values.fold(0, (a, b) => a + b), total);
      expect(map[1], greaterThan(0));
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

    test('returns null when there is no primary sport', () {
      const profile = AppUserProfile(uid: 'a2');
      expect(athleteLevelRank(profile), isNull);
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
      expect(teamLevelRank(p1, p2), 5);
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
}
