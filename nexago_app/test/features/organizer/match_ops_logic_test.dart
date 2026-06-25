import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
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

    test('groupCenterSections puts completed on_court match in finished', () {
      final rows = MatchOpsLogic.toRows([
        _match(
          id: 'done',
          status: TournamentMatchStatus.completed,
          queueStatus: 'on_court',
        ),
      ]);
      final sections = MatchOpsLogic.groupCenterSections(rows);
      expect(sections.live, isEmpty);
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

    test('teamPlayersFromCardTeam maps avatar urls to player info', () {
      final players = MatchOpsLogic.teamPlayersFromCardTeam(
        teamId: 'team-1',
        team: TournamentMatchCardTeamViewModel(
          displayName: 'Marcos / Victor',
          players: const [
            TournamentMatchCardPlayerViewModel(
              initials: 'MA',
              avatarColor: Color(0xFF000000),
              avatarUrl: 'https://cdn.example/ma.jpg',
            ),
            TournamentMatchCardPlayerViewModel(
              initials: 'VI',
              avatarColor: Color(0xFF000000),
              avatarUrl: 'https://cdn.example/vi.jpg',
            ),
          ],
        ),
      );

      expect(players.$1, isA<OrganizerCategoryPlayerInfo>());
      expect(players.$1.name, 'Marcos');
      expect(players.$1.profilePhotoUrl, 'https://cdn.example/ma.jpg');
      expect(players.$2.name, 'Victor');
      expect(players.$2.profilePhotoUrl, 'https://cdn.example/vi.jpg');
    });

    test('categoryDisplayLabel resolves category name from tournament summary', () {
      expect(
        MatchOpsLogic.categoryDisplayLabel(
          categoryId: 'cat-masc-open',
          categories: const [
            OrganizerTournamentCategorySummary(
              categoryId: 'cat-masc-open',
              name: 'Open',
              genderLabel: 'Masculino',
            ),
          ],
        ),
        'MASC Open',
      );
      expect(
        MatchOpsLogic.categoryDisplayLabel(
          categoryId: 'cat-misto-b',
          categories: const [
            OrganizerTournamentCategorySummary(
              categoryId: 'cat-misto-b',
              name: 'Misto B',
              genderLabel: 'Misto',
            ),
          ],
        ),
        'Misto B',
      );
      expect(
        MatchOpsLogic.categoryGenderShortLabel('Feminino'),
        'FEM',
      );
      expect(
        MatchOpsLogic.categoryDisplayLabel(
          categoryId: 'unknown-id',
          categories: const [],
        ),
        'unknown-id',
      );
    });
  });

  group('canReleaseAfterCheckIn', () {
    test('only when both teams are present', () {
      expect(
        MatchOpsLogic.canReleaseAfterCheckIn(
          MatchCheckInStatus.present,
          MatchCheckInStatus.present,
        ),
        isTrue,
      );
      expect(
        MatchOpsLogic.canReleaseAfterCheckIn(
          MatchCheckInStatus.present,
          MatchCheckInStatus.pending,
        ),
        isFalse,
      );
      expect(
        MatchOpsLogic.canReleaseAfterCheckIn(
          MatchCheckInStatus.present,
          MatchCheckInStatus.wo,
        ),
        isFalse,
      );
    });
  });

  group('friendlyScoreError', () {
    test('passes through the server PT message on failed-precondition', () {
      expect(
        MatchOpsLogic.friendlyScoreError(
          code: 'failed-precondition',
          message: 'A chave já tem partidas em andamento.',
        ),
        'A chave já tem partidas em andamento.',
      );
    });

    test('falls back to generic text when message is empty', () {
      expect(
        MatchOpsLogic.friendlyScoreError(
            code: 'failed-precondition', message: ''),
        'A partida não está pronta para receber este placar.',
      );
    });

    test('maps auth/permission/network codes to friendly PT', () {
      expect(
        MatchOpsLogic.friendlyScoreError(code: 'unauthenticated'),
        startsWith('Sua sessão expirou'),
      );
      expect(
        MatchOpsLogic.friendlyScoreError(code: 'permission-denied'),
        contains('permissão'),
      );
      expect(
        MatchOpsLogic.friendlyScoreError(code: 'unavailable'),
        contains('conexão'),
      );
    });

    test('unknown/null code yields the safe default', () {
      expect(
        MatchOpsLogic.friendlyScoreError(code: null),
        'Não foi possível salvar o placar. Tente novamente.',
      );
      expect(
        MatchOpsLogic.friendlyScoreError(code: 'internal'),
        'Não foi possível salvar o placar. Tente novamente.',
      );
    });
  });

  group('resolveTournamentCourts', () {
    test('generates courts from courtsCount when array is absent', () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: 4,
        courtsRaw: null,
      );
      expect(courts, hasLength(4));
      expect(courts.map((c) => c.id), ['Q1', 'Q2', 'Q3', 'Q4']);
    });

    test('preserves custom names when array matches courtsCount', () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: 4,
        courtsRaw: [
          {'id': 'Q1', 'name': 'Quadra Central', 'order': 1},
          {'id': 'Q2', 'name': 'Quadra Lateral', 'order': 2},
          {'id': 'Q3', 'name': 'Quadra 3', 'order': 3},
          {'id': 'Q4', 'name': 'Quadra 4', 'order': 4},
        ],
      );
      expect(courts, hasLength(4));
      expect(courts.first.name, 'Quadra Central');
      expect(courts[1].name, 'Quadra Lateral');
    });

    test('regenerates when array size mismatches courtsCount', () {
      final courts = MatchOpsLogic.resolveTournamentCourts(
        courtsCount: 4,
        courtsRaw: [
          {'id': 'Q1', 'name': 'Quadra Central', 'order': 1},
          {'id': 'Q2', 'name': 'Quadra Lateral', 'order': 2},
        ],
      );
      expect(courts, hasLength(4));
      expect(courts.map((c) => c.name), [
        'Quadra 1',
        'Quadra 2',
        'Quadra 3',
        'Quadra 4',
      ]);
    });

    test('normalizeCourtsCount clamps invalid values to at least 1', () {
      expect(MatchOpsLogic.normalizeCourtsCount(0), 1);
      expect(MatchOpsLogic.normalizeCourtsCount(-3), 1);
      expect(MatchOpsLogic.normalizeCourtsCount(null), 4);
    });
  });
}
