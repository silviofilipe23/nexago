import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_journey_logic.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_journey_view.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_views_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_journey_rail.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_timeline.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_tournament_numbers.dart';

import '../../../core/theme/state_tone_contrast.dart';

// Vitória, derrota e "ao vivo" do Modo Focus (números, ordem do dia e
// caminho até a final) legíveis nos dois temas: no claro o verde e o
// vermelho crus somem no card.

TournamentNumbers _numbers({required int won, required int lost}) =>
    TournamentNumbers(
      matches: 3,
      setsWon: won,
      setsLost: lost,
      points: 126,
      pointsAgainst: 98,
      pointsPerSet: 25.2,
      sets: const [SetBar(label: 'P1 · S1', mine: 21, theirs: 15)],
    );

TimelineEntry _entry(
  String id,
  TimelineState state, {
  TimelineOutcome? outcome,
  String? outcomeLabel,
}) =>
    TimelineEntry(
      matchId: id,
      time: '10:30',
      phaseLabel: 'R1',
      opponentName: 'Sá / Toledo',
      courtLabel: 'Quadra 1',
      outcomeLabel: outcomeLabel,
      outcome: outcome,
      state: state,
      note: null,
      clickable: true,
    );

JourneyStepRow _step(String id, JourneyStepStatus status, String score) =>
    JourneyStepRow(
      id: id,
      status: status,
      phaseLabel: 'Quartas',
      metaLabel: 'Quadra 1',
      opponentName: 'Sá / Toledo',
      detailLabel: null,
      scoreLabel: score,
      matchId: id,
    );

Future<void> _pump(WidgetTester tester, ThemeData theme, Widget child) async {
  tester.view.physicalSize = const Size(402, 1200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: theme,
      home: Builder(
        builder: (context) => Scaffold(
          backgroundColor: context.themeColors.canvas,
          body: SingleChildScrollView(child: child),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $label', () {
      testWidgets('números: saldo de sets positivo e negativo', (tester) async {
        await _pump(
          tester,
          theme,
          Column(
            children: [
              FocusTournamentNumbers(numbers: _numbers(won: 4, lost: 1)),
              FocusTournamentNumbers(numbers: _numbers(won: 1, lost: 4)),
            ],
          ),
        );
        expect(
          expectStateTonesLegible(tester, find.byType(Column).first),
          containsAll(['4–1', '1–4']),
        );
      });

      testWidgets('ordem do dia: vitória e partida ao vivo', (tester) async {
        await _pump(
          tester,
          theme,
          FocusTimeline(
            entries: [
              _entry(
                'm1',
                TimelineState.done,
                outcome: TimelineOutcome.win,
                outcomeLabel: 'V 2–0',
              ),
              _entry('m2', TimelineState.live),
            ],
            onOpen: (_) {},
          ),
        );
        expect(
          expectStateTonesLegible(tester, find.byType(FocusTimeline)),
          containsAll([Icons.check_rounded, '10:30', 'marca']),
        );
      });

      testWidgets('caminho até a final: vitória, derrota e ao vivo', (
        tester,
      ) async {
        await _pump(
          tester,
          theme,
          FocusJourneyRail(
            steps: [
              _step('m1', JourneyStepStatus.win, '2–0'),
              _step('m2', JourneyStepStatus.loss, '0–2'),
              _step('m3', JourneyStepStatus.live, '1–1'),
            ],
            onOpen: (_) {},
          ),
        );
        expect(
          expectStateTonesLegible(tester, find.byType(FocusJourneyRail)),
          containsAll(['2–0', '0–2']),
        );
      });
    });
  }

  testWidgets('tema escuro: tons do Focus iguais aos de antes', (
    tester,
  ) async {
    await _pump(
      tester,
      AppTheme.dark,
      Column(
        children: [
          FocusTournamentNumbers(numbers: _numbers(won: 1, lost: 4)),
          FocusJourneyRail(
            steps: [
              _step('m1', JourneyStepStatus.win, '2–0'),
              _step('m2', JourneyStepStatus.loss, '0–2'),
            ],
            onOpen: (_) {},
          ),
        ],
      ),
    );
    Color? colorOf(String text) =>
        tester.widget<Text>(find.text(text)).style!.color;
    expect(colorOf('1–4'), AppColors.live);
    expect(colorOf('2–0'), AppColors.win);
    expect(colorOf('0–2'), AppColors.live);
  });
}
