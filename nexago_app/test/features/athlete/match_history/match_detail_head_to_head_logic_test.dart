import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/match_detail_head_to_head_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _mutualMatch({
  required String id,
  required String ourTeamId,
  required String opponentTeamId,
  required String winnerId,
  required DateTime playedAt,
  String tournamentId = 't1',
  List<TournamentMatchSet> sets = const [
    TournamentMatchSet(a: 21, b: 17),
    TournamentMatchSet(a: 21, b: 19),
  ],
}) {
  return TournamentMatch(
    id: id,
    tournamentId: tournamentId,
    categoryId: 'cat',
    round: 1,
    matchType: 'Group',
    poolId: 'A',
    teamAId: ourTeamId,
    teamBId: opponentTeamId,
    status: TournamentMatchStatus.completed,
    resultA: '2',
    resultB: '0',
    isGroupMatch: true,
    matchNumber: 1,
    winnerId: winnerId,
    matchEndedAt: playedAt,
    sets: sets,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  const ourTeamId = 'our-team';
  const opponentTeamId = 'opp-team';
  const currentMatchId = 'current';
  final baseTime = DateTime.utc(2026, 3, 15, 12);

  group('mutualMatchesBetweenTeams', () {
    test('returns only completed mutual matches excluding current', () {
      final ourMatches = [
        _mutualMatch(
          id: 'm1',
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
        _mutualMatch(
          id: currentMatchId,
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 1)),
        ),
        _mutualMatch(
          id: 'm3',
          ourTeamId: ourTeamId,
          opponentTeamId: 'other',
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 2)),
        ),
      ];

      final mutual = mutualMatchesBetweenTeams(
        ourTeamMatches: ourMatches,
        opponentTeamMatches: const [],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
      );

      expect(mutual, hasLength(1));
      expect(mutual.first.id, 'm1');
    });
  });

  group('buildMatchDetailHeadToHeadInfo', () {
    test('returns null when no mutual history', () {
      final info = buildMatchDetailHeadToHeadInfo(
        ourTeamMatches: const [],
        opponentTeamMatches: const [],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
        opponentLabel: 'Dupla X',
        phase: MatchDetailPhase.scheduled,
        tournamentNames: const {},
      );

      expect(info, isNull);
    });

    test('scheduled title reflects win advantage', () {
      final matches = [
        _mutualMatch(
          id: 'm1',
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
        _mutualMatch(
          id: 'm2',
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 1)),
        ),
        _mutualMatch(
          id: 'm3',
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: opponentTeamId,
          playedAt: baseTime.add(const Duration(days: 2)),
          sets: const [
            TournamentMatchSet(a: 17, b: 21),
            TournamentMatchSet(a: 18, b: 21),
          ],
        ),
      ];

      final info = buildMatchDetailHeadToHeadInfo(
        ourTeamMatches: matches,
        opponentTeamMatches: const [],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
        opponentLabel: 'Dupla X',
        phase: MatchDetailPhase.scheduled,
        tournamentNames: const {'t1': 'Open Goiânia'},
      );

      expect(info, isNotNull);
      expect(info!.title, 'Você leva vantagem');
      expect(info.ourWins, 2);
      expect(info.ourLosses, 1);
      expect(info.pastMatches, hasLength(3));
      expect(info.pastMatches.first.isWin, isFalse);
      expect(info.pastMatches.first.score, '0-2');
      expect(info.pastMatches.first.label, contains('Open Goiânia'));
    });

    test('completed title uses opponent label', () {
      final matches = [
        _mutualMatch(
          id: 'm1',
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
      ];

      final info = buildMatchDetailHeadToHeadInfo(
        ourTeamMatches: matches,
        opponentTeamMatches: const [],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
        opponentLabel: 'Dupla X',
        phase: MatchDetailPhase.completed,
        tournamentNames: const {'t1': 'Open Goiânia'},
      );

      expect(info!.title, 'Você vs Dupla X');
    });

    test('completed phase includes current match in win-loss count', () {
      final matches = [
        _mutualMatch(
          id: 'm1',
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime,
        ),
        _mutualMatch(
          id: 'm2',
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 1)),
        ),
        _mutualMatch(
          id: currentMatchId,
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          winnerId: ourTeamId,
          playedAt: baseTime.add(const Duration(days: 2)),
        ),
      ];

      final info = buildMatchDetailHeadToHeadInfo(
        ourTeamMatches: matches,
        opponentTeamMatches: const [],
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
        excludeMatchId: currentMatchId,
        opponentLabel: 'Dupla X',
        phase: MatchDetailPhase.completed,
        tournamentNames: const {'t1': 'Open Goiânia'},
      );

      expect(info, isNotNull);
      expect(info!.ourWins, 3);
      expect(info.ourLosses, 0);
      expect(info.pastMatches.first.isWin, isTrue);
    });
  });
}
