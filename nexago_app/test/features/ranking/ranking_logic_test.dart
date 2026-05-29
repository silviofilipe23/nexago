import 'package:flutter_test/flutter_test.dart';
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
}
