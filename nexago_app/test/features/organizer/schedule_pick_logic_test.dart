import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_pick_logic.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_schedule_pick_widgets.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String categoryId = 'cat1',
  String teamAId = 'a',
  String teamBId = 'b',
  DateTime? scheduleTime,
  DateTime? scheduleEndTime,
  String courtId = '',
  String status = TournamentMatchStatus.scheduled,
  String matchType = 'wb',
  String poolId = '',
  bool isGroupMatch = false,
  String? teamADescription = 'Léo / Tiago',
  String? teamBDescription = 'Marcos / Victor',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: categoryId,
    round: 1,
    matchType: matchType,
    poolId: poolId,
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: isGroupMatch,
    matchNumber: 1,
    scheduleTime: scheduleTime,
    scheduleEndTime: scheduleEndTime,
    courtId: courtId,
    teamADescription: teamADescription,
    teamBDescription: teamBDescription,
  );
}

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: AppTheme.dark,
    home: Scaffold(body: child),
  );
}

void main() {
  group('SchedulePickLogic', () {
    test('classifies ready and blocked matches', () {
      final ready = _match();
      // Sem dupla e sem placeholder de chave => bloqueada de fato.
      final blocked = _match(teamBId: '', teamBDescription: '');

      expect(SchedulePickLogic.isReady(ready), isTrue);
      expect(SchedulePickLogic.isConfirmed(ready), isTrue);
      expect(SchedulePickLogic.isBlocked(blocked), isTrue);
      expect(SchedulePickLogic.isReady(blocked), isFalse);
    });

    test('bracket match with TBD placeholder is schedulable (pré-reserva)', () {
      final tentative = _match(teamBId: '', teamBDescription: 'Vencedor SF2');

      expect(SchedulePickLogic.isReady(tentative), isTrue);
      expect(SchedulePickLogic.isConfirmed(tentative), isFalse);
      expect(SchedulePickLogic.isTentative(tentative), isTrue);
      expect(SchedulePickLogic.isBlocked(tentative), isFalse);
    });

    test('pool match without teams is blocked even with description', () {
      final pool = _match(
        teamAId: '',
        teamBId: '',
        isGroupMatch: true,
        poolId: 'g1',
        matchType: 'group',
      );

      expect(SchedulePickLogic.isReady(pool), isFalse);
      expect(SchedulePickLogic.isBlocked(pool), isTrue);
    });

    test('match with time but no court is partially scheduled', () {
      final partial = _match(scheduleTime: DateTime(2026, 6, 16, 14, 30));

      expect(SchedulePickLogic.isPartiallyScheduled(partial), isTrue);
      expect(SchedulePickLogic.isUnscheduled(partial), isTrue);
      expect(SchedulePickLogic.isReady(partial), isTrue);
    });

    test('tabCounts reflect unscheduled pool', () {
      final matches = [
        _match(id: 'm1'),
        _match(id: 'm2'),
        _match(id: 'm3', teamAId: '', teamADescription: ''),
      ];
      final counts = SchedulePickLogic.tabCounts(matches);

      expect(counts.unscheduled, 3);
      expect(counts.ready, 2);
      expect(counts.blocked, 1);
    });

    test('filterByCategory limits list', () {
      final matches = [
        _match(id: 'm1', categoryId: 'a'),
        _match(id: 'm2', categoryId: 'b'),
      ];
      final filtered = SchedulePickLogic.filterByCategory(
        matches,
        categoryId: 'a',
      );
      expect(filtered, hasLength(1));
      expect(filtered.first.id, 'm1');
    });

    test('matchesForDay includes unscheduled matches without dayKey', () {
      final unscheduled = _match(id: 'm1');
      final scheduledOther = TournamentMatch(
        id: 'm3',
        tournamentId: 't1',
        categoryId: 'cat1',
        round: 1,
        matchType: 'wb',
        poolId: '',
        teamAId: 'a',
        teamBId: 'b',
        status: TournamentMatchStatus.scheduled,
        resultA: '',
        resultB: '',
        isGroupMatch: false,
        matchNumber: 2,
        scheduleTime: DateTime(2026, 6, 20, 11),
        courtId: 'Q1',
        dayKey: '2026-06-20',
      );

      final pool = MatchOpsLogic.matchesForDay(
        [unscheduled, scheduledOther],
        '2026-06-16',
      );

      expect(pool.map((m) => m.id), contains('m1'));
      expect(pool.map((m) => m.id), isNot(contains('m3')));
    });

    test('suggestSlotForMatch returns court and time', () {
      const config = TournamentMatchOpsConfig(
        dayStart: '08:00',
        defaultMatchDurationMin: 50,
        minRestBetweenMatchesMin: 45,
      );
      const courts = [
        TournamentCourt(id: 'Q1', name: 'Q1', order: 1),
        TournamentCourt(id: 'Q2', name: 'Q2', order: 2),
      ];
      final matches = [_match(id: 'm1'), _match(id: 'm2')];
      final suggestion = SchedulePickLogic.suggestSlotForMatch(
        match: matches.first,
        dayMatches: matches,
        courts: courts,
        config: config,
        dayKey: '2026-06-16',
      );

      expect(suggestion, isNotNull);
      expect(suggestion!.courtId, 'Q1');
      expect(suggestion.label, contains('08:00'));
    });

    test('suggestSlotsForDay preserves an already-defined time (item 2)', () {
      const config = TournamentMatchOpsConfig(
        dayStart: '08:00',
        defaultMatchDurationMin: 50,
        minRestBetweenMatchesMin: 45,
      );
      const courts = [TournamentCourt(id: 'Q1', name: 'Q1', order: 1)];
      // Tem horário (14:30) mas ainda sem quadra: não pode ser realocada.
      final partial = _match(id: 'm1', scheduleTime: DateTime(2026, 6, 16, 14, 30));

      final suggestions = SchedulePickLogic.suggestSlotsForDay(
        dayMatches: [partial],
        courts: courts,
        config: config,
        dayKey: '2026-06-16',
      );

      expect(suggestions['m1'], isNotNull);
      expect(suggestions['m1']!.start, DateTime(2026, 6, 16, 14, 30));
      expect(suggestions['m1']!.courtId, isEmpty);
      expect(suggestions['m1']!.label, '14:30');
    });
  });

  testWidgets('SchedulePickHeader shows title', (tester) async {
    await tester.pumpWidget(
      _wrap(
        SchedulePickHeader(
          programLabel: 'PROGRAMAÇÃO • DIA 1',
          onBack: () {},
        ),
      ),
    );

    expect(find.text('Agendar partida'), findsOneWidget);
    expect(find.text('PROGRAMAÇÃO • DIA 1'), findsOneWidget);
  });

  testWidgets('SchedulePickMatchCard shows selected state', (tester) async {
    final match = _match();
    await tester.pumpWidget(
      _wrap(
        SchedulePickMatchCard(
          match: match,
          categoryLabel: 'Fem Open',
          teamA: const LiveTableTeamData(
            label: 'Léo / Tiago',
            player1: OrganizerCategoryPlayerInfo(uid: 'a', name: 'Léo'),
            player2: OrganizerCategoryPlayerInfo(uid: 'b', name: 'Tiago'),
          ),
          teamB: const LiveTableTeamData(
            label: 'Marcos / Victor',
            player1: OrganizerCategoryPlayerInfo(uid: 'c', name: 'Marcos'),
            player2: OrganizerCategoryPlayerInfo(uid: 'd', name: 'Victor'),
          ),
          suggestionLabel: 'Q2 • 10:00',
          selected: true,
          selectable: true,
          onTap: () {},
        ),
      ),
    );

    expect(find.text('PRONTA'), findsOneWidget);
    expect(find.text('sugestão Q2 • 10:00'), findsOneWidget);
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);
  });
}
