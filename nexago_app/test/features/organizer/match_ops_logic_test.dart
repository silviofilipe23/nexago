import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String status = TournamentMatchStatus.scheduled,
  String queueStatus = '',
  int queueOrder = 0,
  String categoryId = 'Masc A',
  DateTime? scheduleTime,
  String courtId = '',
  String teamAId = 't1',
  String teamBId = 't2',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 'tor1',
    categoryId: categoryId,
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
    scheduleTime: scheduleTime,
    queueStatus: queueStatus,
    queueOrder: queueOrder,
    courtId: courtId,
  );
}

void main() {
  group('MatchOpsLogic', () {
    test('groupCenterSections splits live upcoming finished', () {
      final rows = MatchOpsLogic.toRows([
        _match(id: 'live', status: TournamentMatchStatus.inProgress),
        _match(id: 'up', status: TournamentMatchStatus.scheduled),
        _match(id: 'done', status: TournamentMatchStatus.completed),
      ]);
      final sections = MatchOpsLogic.groupCenterSections(rows);
      expect(sections.live.map((r) => r.match.id), ['live']);
      expect(sections.upcoming.map((r) => r.match.id), ['up']);
      expect(sections.finished.map((r) => r.match.id), ['done']);
    });

    test('filterCenter by category and live', () {
      final rows = MatchOpsLogic.toRows([
        _match(id: 'a', categoryId: 'A', status: TournamentMatchStatus.inProgress),
        _match(id: 'b', categoryId: 'B', status: TournamentMatchStatus.inProgress),
      ]);
      final filtered = MatchOpsLogic.filterCenter(
        rows,
        filter: OrganizerMatchCenterFilter.live,
        categoryId: 'A',
      );
      expect(filtered.length, 1);
      expect(filtered.first.match.id, 'a');
    });

    test('sortCallQueue orders by queueOrder', () {
      final rows = MatchOpsLogic.toRows([
        _match(id: 'b', queueStatus: 'waiting', queueOrder: 2),
        _match(id: 'a', queueStatus: 'waiting', queueOrder: 1),
        _match(id: 'c', status: TournamentMatchStatus.completed),
      ]);
      final queue = MatchOpsLogic.sortCallQueue(rows);
      expect(queue.map((r) => r.match.id), ['a', 'b']);
    });

    test('groupCenterSections accepts legacy in_progress status', () {
      final rows = MatchOpsLogic.toRows([
        _match(id: 'live', status: 'in_progress'),
      ]);
      final sections = MatchOpsLogic.groupCenterSections(rows);
      expect(sections.live.map((r) => r.match.id), ['live']);
    });

    test('buildCourtSummaries finds current match', () {
      final courts = [
        const TournamentCourt(id: 'Q1', name: 'Quadra 1', order: 1),
      ];
      final summaries = MatchOpsLogic.buildCourtSummaries(
        courts: courts,
        matches: [
          _match(
            id: 'live',
            courtId: 'Q1',
            status: TournamentMatchStatus.inProgress,
          ),
        ],
      );
      expect(summaries.first.currentMatch?.id, 'live');
    });
  });
}
