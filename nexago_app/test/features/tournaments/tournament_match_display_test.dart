import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_display.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String teamAId = 'team-a',
  String teamBId = 'team-b',
  String status = TournamentMatchStatus.scheduled,
  List<TournamentMatchSet> sets = const [],
  String resultA = '',
  String resultB = '',
  String? winnerId,
  int matchNumber = 1,
  String? courtName,
}) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: 1,
    matchType: 'Group',
    poolId: 'A',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: resultA,
    resultB: resultB,
    isGroupMatch: true,
    matchNumber: matchNumber,
    sets: sets,
    winnerId: winnerId,
    courtName: courtName,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('playedSetsForMatch', () {
    test('excludes unplayed third set on 2-0 completed match', () {
      final match = _match(
        status: TournamentMatchStatus.completed,
        winnerId: 'team-a',
        sets: const [
          TournamentMatchSet(a: 21, b: 15),
          TournamentMatchSet(a: 21, b: 18),
          TournamentMatchSet(a: 0, b: 0),
        ],
      );

      expect(setsForMatch(match), hasLength(3));
      expect(playedSetsForMatch(match), hasLength(2));
    });

    test('keeps current live set even when score is 0-0', () {
      final match = TournamentMatch(
        id: 'm1',
        tournamentId: 't1',
        categoryId: 'cat-a',
        round: 1,
        matchType: 'Group',
        poolId: 'A',
        teamAId: 'team-a',
        teamBId: 'team-b',
        status: TournamentMatchStatus.inProgress,
        resultA: '',
        resultB: '',
        isGroupMatch: true,
        matchNumber: 1,
        sets: const [
          TournamentMatchSet(a: 21, b: 19),
          TournamentMatchSet(a: 0, b: 0),
        ],
        currentSetIndex: 1,
      );

      expect(playedSetsForMatch(match), hasLength(2));
      expect(playedSetsForMatch(match).last.a, 0);
      expect(playedSetsForMatch(match).last.b, 0);
    });
  });

  group('setsWonCountForMatch', () {
    test('counts sets won from structured sets', () {
      final match = _match(
        sets: const [
          TournamentMatchSet(a: 6, b: 4),
          TournamentMatchSet(a: 3, b: 6),
          TournamentMatchSet(a: 7, b: 5),
        ],
      );

      expect(setsWonCountForMatch(match), (2, 1));
    });

    test('ignores tied sets', () {
      final match = _match(
        sets: const [
          TournamentMatchSet(a: 6, b: 4),
          TournamentMatchSet(a: 4, b: 4),
        ],
      );

      expect(setsWonCountForMatch(match), (1, 0));
    });

    test('parses sets from result strings when sets list is empty', () {
      final match = _match(
        resultA: '6-4, 6-3',
        resultB: '4-6, 3-6',
      );

      expect(setsWonCountForMatch(match), (2, 0));
    });

    test('returns zero counts when no score data', () {
      expect(setsWonCountForMatch(_match()), (0, 0));
    });
  });

  group('matchHasScoreData', () {
    test('is true when match is in progress', () {
      final match = _match(status: TournamentMatchStatus.inProgress);
      expect(matchHasScoreData(match), isTrue);
    });

    test('is true when sets exist', () {
      final match = _match(
        sets: const [TournamentMatchSet(a: 6, b: 4)],
      );
      expect(matchHasScoreData(match), isTrue);
    });

    test('is false for scheduled match without sets', () {
      expect(matchHasScoreData(_match()), isFalse);
    });
  });

  group('matchTeamAWon', () {
    test('uses winnerId when present', () {
      final match = _match(
        winnerId: 'team-b',
        sets: const [TournamentMatchSet(a: 6, b: 4)],
      );

      expect(matchTeamAWon(match), isFalse);
    });

    test('uses sets won when winnerId is empty', () {
      final match = _match(
        sets: const [
          TournamentMatchSet(a: 6, b: 4),
          TournamentMatchSet(a: 6, b: 2),
        ],
      );

      expect(matchTeamAWon(match), isTrue);
    });

    test('returns null when sets are tied', () {
      final match = _match(
        sets: const [
          TournamentMatchSet(a: 6, b: 4),
          TournamentMatchSet(a: 3, b: 6),
        ],
      );

      expect(matchTeamAWon(match), isNull);
    });

    test('returns null when no score data', () {
      expect(matchTeamAWon(_match()), isNull);
    });
  });

  group('isMatchTeamWinner', () {
    test('returns true only for the winning team', () {
      final match = _match(
        winnerId: 'team-a',
        sets: const [TournamentMatchSet(a: 6, b: 4)],
      );

      expect(isMatchTeamWinner(match, isTeamA: true), isTrue);
      expect(isMatchTeamWinner(match, isTeamA: false), isFalse);
    });

    test('returns false for both teams when winner is undetermined', () {
      final match = _match();

      expect(isMatchTeamWinner(match, isTeamA: true), isFalse);
      expect(isMatchTeamWinner(match, isTeamA: false), isFalse);
    });
  });

  group('setPartialsLabelForTeam', () {
    test('formats structured sets with each team own points only', () {
      final match = _match(
        sets: const [
          TournamentMatchSet(a: 6, b: 4),
          TournamentMatchSet(a: 3, b: 6),
          TournamentMatchSet(a: 7, b: 5),
        ],
      );

      expect(
        setPartialsLabelForTeam(match: match, isTeamA: true),
        '6 · 3 · 7',
      );
      expect(
        setPartialsLabelForTeam(match: match, isTeamA: false),
        '4 · 6 · 5',
      );
    });

    test('parses comma-separated result strings with own points only', () {
      final match = _match(
        resultA: '6-4, 6-3',
        resultB: '4-6, 3-6',
      );

      expect(
        setPartialsLabelForTeam(match: match, isTeamA: true),
        '6 · 6',
      );
      expect(
        setPartialsLabelForTeam(match: match, isTeamA: false),
        '4 · 3',
      );
    });

    test('returns empty when no partial data exists', () {
      expect(setPartialsLabelForTeam(match: _match(), isTeamA: true), '');
    });
  });

  group('matchTimeLabelForCard', () {
    test('shows time only for same-day matches', () {
      final match = _match(
        status: TournamentMatchStatus.scheduled,
      ).copyWithScheduleTime(DateTime(2026, 5, 31, 14, 30));

      expect(
        matchTimeLabelForCard(match, reference: DateTime(2026, 5, 31, 9)),
        '14:30',
      );
    });

    test('shows date and time for other days', () {
      final match = _match(
        status: TournamentMatchStatus.scheduled,
      ).copyWithScheduleTime(DateTime(2026, 6, 1, 9, 15));

      expect(
        matchTimeLabelForCard(match, reference: DateTime(2026, 5, 31, 9)),
        '01/06 · 09:15',
      );
    });

    test('prefers matchStartedAt when in progress', () {
      final match = _match(
        status: TournamentMatchStatus.inProgress,
      ).copyWithScheduleTime(
        DateTime(2026, 5, 31, 14, 30),
        matchStartedAt: DateTime(2026, 5, 31, 14, 42),
      );

      expect(
        matchTimeLabelForCard(match, reference: DateTime(2026, 5, 31, 9)),
        '14:42',
      );
    });

    test('returns empty when no time is available', () {
      expect(matchTimeLabelForCard(_match()), '');
    });
  });

  group('matchNumberLabelForCard', () {
    test('formats positive match numbers', () {
      expect(
        matchNumberLabelForCard(_match(matchNumber: 12)),
        'Jogo #12',
      );
    });

    test('returns empty when match number is zero', () {
      expect(matchNumberLabelForCard(_match(matchNumber: 0)), '');
    });
  });

  group('matchCourtLabelForCard', () {
    test('returns trimmed court name', () {
      expect(
        matchCourtLabelForCard(_match(courtName: '  Quadra 2  ')),
        'Quadra 2',
      );
    });

    test('prefixes numeric court names', () {
      expect(matchCourtLabelForCard(_match(courtName: '1')), 'Quadra 1');
      expect(matchCourtLabelForCard(_match(courtName: '2')), 'Quadra 2');
    });

    test('keeps court names that already include quadra', () {
      expect(
        matchCourtLabelForCard(_match(courtName: 'QUADRA CENTRAL')),
        'QUADRA CENTRAL',
      );
    });

    test('returns empty when court is missing', () {
      expect(matchCourtLabelForCard(_match()), '');
    });
  });

  group('matchMetaLabelForCard', () {
    test('joins match number and court', () {
      expect(
        matchMetaLabelForCard(_match(matchNumber: 3, courtName: 'Quadra 1')),
        'Jogo #3 · Quadra 1',
      );
    });

    test('formats numeric court in meta label', () {
      expect(
        matchMetaLabelForCard(_match(matchNumber: 3, courtName: '2')),
        'Jogo #3 · Quadra 2',
      );
    });

    test('returns only court when match number is zero', () {
      expect(
        matchMetaLabelForCard(_match(matchNumber: 0, courtName: 'Quadra 1')),
        'Quadra 1',
      );
    });
  });
}

extension on TournamentMatch {
  TournamentMatch copyWithScheduleTime(
    DateTime scheduleTime, {
    DateTime? matchStartedAt,
    DateTime? matchEndedAt,
  }) {
    return TournamentMatch(
      id: id,
      tournamentId: tournamentId,
      categoryId: categoryId,
      round: round,
      matchType: matchType,
      poolId: poolId,
      teamAId: teamAId,
      teamBId: teamBId,
      status: status,
      resultA: resultA,
      resultB: resultB,
      isGroupMatch: isGroupMatch,
      matchNumber: matchNumber,
      sets: sets,
      currentSetIndex: currentSetIndex,
      winnerId: winnerId,
      scheduleTime: scheduleTime,
      matchStartedAt: matchStartedAt,
      matchEndedAt: matchEndedAt,
      teamADescription: teamADescription,
      teamBDescription: teamBDescription,
      courtName: courtName,
      description: description,
    );
  }
}
