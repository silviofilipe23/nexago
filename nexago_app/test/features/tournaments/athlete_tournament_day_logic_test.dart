import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String status = TournamentMatchStatus.scheduled,
  String queueStatus = '',
  int queueOrder = 0,
  String teamAId = 'team-me',
  String teamBId = 'team-other',
  DateTime? scheduleTime,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat',
    round: 1,
    matchType: 'wb',
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    queueStatus: queueStatus,
    queueOrder: queueOrder,
    scheduleTime: scheduleTime,
  );
}

void main() {
  test('pickAthleteNextMatch prefers court call', () {
    final next = pickAthleteNextMatch(
      matches: [
        _match(id: 'scheduled', scheduleTime: DateTime(2026, 6, 14, 10)),
        _match(id: 'call', queueStatus: 'on_court'),
      ],
      teamId: 'team-me',
      tournamentId: 't1',
      tournamentName: 'Copa',
    );
    expect(next?.match.id, 'call');
    expect(next?.isCourtCall, isTrue);
  });

  test('TournamentMatchStatus accepts legacy snake_case', () {
    expect(TournamentMatchStatus.isInProgress('in_progress'), isTrue);
    expect(TournamentMatchStatus.isCompleted('completed'), isTrue);
    expect(TournamentMatchStatus.isScheduled('scheduled'), isTrue);
  });

  test('pickAthleteCourtCallMatch finds on_court match', () {
    final call = pickAthleteCourtCallMatch(
      matches: [
        _match(id: 'waiting', queueStatus: 'waiting'),
        _match(id: 'court', queueStatus: 'on_court'),
      ],
      teamId: 'team-me',
      tournamentId: 't1',
      tournamentName: 'Copa',
    );
    expect(call?.match.id, 'court');
  });
}
