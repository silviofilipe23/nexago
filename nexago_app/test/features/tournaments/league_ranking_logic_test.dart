import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/league_ranking_logic.dart';
import 'package:nexago_app/features/tournaments/domain/league_ranking_models.dart';

void main() {
  group('effectivePointsForMode', () {
    const stages = [
      LeagueStageResult(tournamentId: 't1', place: 1, points: 450),
      LeagueStageResult(tournamentId: 't2', place: 2, points: 280),
      LeagueStageResult(tournamentId: 't3', place: 3, points: 180),
      LeagueStageResult(tournamentId: 't4', place: 4, points: 120),
      LeagueStageResult(tournamentId: 't5', place: 5, points: 80),
      LeagueStageResult(tournamentId: 't6', place: 6, points: 40),
    ];

    test('all stages sums everything', () {
      expect(
        effectivePointsForMode(stages, LeaguePointsCountingMode.allStages),
        1150,
      );
    });

    test('best4Of6 keeps top four', () {
      expect(
        effectivePointsForMode(stages, LeaguePointsCountingMode.best4Of6),
        1030,
      );
    });

    test('best3Of5 keeps top three', () {
      expect(
        effectivePointsForMode(stages, LeaguePointsCountingMode.best3Of5),
        910,
      );
    });
  });

  group('buildLeagueTeamRankingRows', () {
    test('sorts by effective points descending', () {
      final rows = buildLeagueTeamRankingRows(
        const [
          LeagueTeamRankingEntry(
            id: 'a',
            leagueId: 'l1',
            categoryId: 'c1',
            teamId: 'team-b',
            stageResults: [],
            effectivePoints: 280,
            rawPoints: 280,
            countingMode: LeaguePointsCountingMode.best4Of6,
          ),
          LeagueTeamRankingEntry(
            id: 'b',
            leagueId: 'l1',
            categoryId: 'c1',
            teamId: 'team-a',
            stageResults: [],
            effectivePoints: 450,
            rawPoints: 450,
            countingMode: LeaguePointsCountingMode.best4Of6,
          ),
        ],
        const {'team-a': 'Dupla A', 'team-b': 'Dupla B'},
      );

      expect(rows.length, 2);
      expect(rows.first.teamId, 'team-a');
      expect(rows.first.rank, 1);
      expect(rows.first.displayName, 'Dupla A');
    });
  });
}
