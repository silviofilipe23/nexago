import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/data/match_history/mock_athlete_match_history_data.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_logic.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';

void main() {
  late AthleteMatchHistoryBundle bundle;

  setUp(() {
    bundle = mockAthleteMatchHistoryBundle();
  });

  group('filterMatches', () {
    test('all returns full list', () {
      expect(
        filterMatches(bundle.matches, MatchHistoryFilter.all).length,
        bundle.matches.length,
      );
    });

    test('year2026 filters by year', () {
      final filtered = filterMatches(
        bundle.matches,
        MatchHistoryFilter.year2026,
      );
      expect(filtered.every((m) => m.playedAt.year == 2026), isTrue);
      expect(filtered.length, 19);
    });

    test('winsOnly returns only wins', () {
      final filtered = filterMatches(
        bundle.matches,
        MatchHistoryFilter.winsOnly,
      );
      expect(filtered.every((m) => m.isWin), isTrue);
      expect(filtered.length, 20);
    });
  });

  group('groupMatchesByMonth', () {
    test('groups are sorted newest first', () {
      final groups = groupMatchesByMonth(bundle.matches);
      expect(groups.first.title, contains('2026'));
      for (var i = 0; i < groups.length - 1; i++) {
        expect(
          groups[i].monthKey.compareTo(groups[i + 1].monthKey) >= 0,
          isTrue,
        );
      }
    });

    test('month summary counts wins and losses', () {
      final may2026 = groupMatchesByMonth(
        filterMatches(bundle.matches, MatchHistoryFilter.year2026),
      ).firstWhere((g) => g.title.contains('Maio'));
      expect(may2026.summaryLabel, '3 JOGOS • 2V 1D');
    });
  });

  group('buildSeasonSummary', () {
    test('computes win rate for 2026', () {
      final summary = buildSeasonSummary(matches: bundle.matches, year: 2026);
      expect(summary.wins, 14);
      expect(summary.losses, 5);
      expect(summary.winRatePercent, closeTo(73.68, 0.1));
    });

    test('includes monthly bars for months with games', () {
      final summary = buildSeasonSummary(matches: bundle.matches, year: 2026);
      expect(summary.monthlyBars, isNotEmpty);
      expect(summary.monthlyBars.first.label, isNotEmpty);
    });
  });

  group('countTournamentMedals', () {
    test('counts gold silver bronze', () {
      final counts = countTournamentMedals(bundle.tournaments);
      expect(counts.total, 6);
      expect(counts.gold, 2);
      expect(counts.silver, 2);
      expect(counts.bronze, 1);
    });
  });

  group('matchHistorySettingsSubtitle', () {
    test('formats counts', () {
      expect(
        matchHistorySettingsSubtitle(matchCount: 28, tournamentCount: 6),
        '28 jogos · 6 torneios',
      );
    });
  });
}
