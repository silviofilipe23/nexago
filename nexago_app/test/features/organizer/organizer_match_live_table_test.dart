import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_point_event.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: child),
    );
  }

  LiveTableTeamData team(String label) {
    final players = label
        .split('/')
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();
    return LiveTableTeamData(
      label: label,
      player1: OrganizerCategoryPlayerInfo(
        uid: 'p1',
        name: players.isNotEmpty ? players.first : '?',
      ),
      player2: OrganizerCategoryPlayerInfo(
        uid: 'p2',
        name: players.length > 1 ? players[1] : '',
      ),
    );
  }

  testWidgets('LiveTableHeader shows court and elapsed', (tester) async {
    await tester.pumpWidget(
      wrap(
        LiveTableHeader(
          courtLabel: 'Q1',
          titleLabel: 'Masc Open · Quartas',
          elapsedLabel: '24:10',
          onBack: () {},
        ),
      ),
    );

    expect(find.textContaining('MESA AO VIVO'), findsOneWidget);
    expect(find.text('Q1'), findsOneWidget);
    expect(find.text('Masc Open · Quartas'), findsOneWidget);
    expect(find.text('24:10'), findsOneWidget);
  });

  testWidgets('LiveTableTeamScoreBoard renders side by side teams', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        LiveTableTeamScoreBoard(
          teamA: team('Marcos / Victor'),
          teamB: team('Igor / João'),
          scoreA: 18,
          scoreB: 16,
          isServingA: true,
          isServingB: false,
          seedA: 1,
          seedB: 8,
          onAddPointA: () {},
          onAddPointB: () {},
        ),
      ),
    );

    expect(find.text('Marcos / Victor'), findsOneWidget);
    expect(find.text('Igor / João'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('16'), findsOneWidget);
    expect(find.text('SAQUE'), findsOneWidget);
    expect(find.text('cabeça #1'), findsOneWidget);
    expect(find.text('cabeça #8'), findsOneWidget);
  });

  testWidgets('LiveTablePointFeed shows recent points with descriptions', (
    tester,
  ) async {
    final teamA = team('Marcos / Victor');
    final teamB = team('Igor / João');
    final events = [
      TournamentMatchPointEvent(
        seq: 1,
        type: 'point',
        setIndex: 0,
        scoreA: 18,
        scoreB: 16,
        side: 'A',
        ts: DateTime(2026, 6, 16, 10, 5),
      ),
    ];

    await tester.pumpWidget(
      wrap(
        LiveTablePointFeed(
          setIndex: 0,
          teamA: teamA,
          teamB: teamB,
          events: events,
        ),
      ),
    );

    expect(find.textContaining('ÚLTIMOS PONTOS · SET 1'), findsOneWidget);
    expect(find.text('18-16'), findsOneWidget);
    expect(find.textContaining('Ponto · Marcos'), findsOneWidget);
  });

  testWidgets('LiveTableQuickScoreEntry shows no-scorekeeper prompt', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap(
        LiveTableQuickScoreEntry(onTap: () {}),
      ),
    );

    expect(find.text('Sem mesário?'), findsOneWidget);
    expect(
      find.text('Informe o placar completo de uma vez'),
      findsOneWidget,
    );
  });

  testWidgets(
    'LiveTableFullModeMesa não estoura o nome da dupla em tela de celular',
    (tester) async {
      // ~iPhone 14: cada painel do modo full fica com ~172px úteis — o mesmo
      // constraint do overflow em produção (Row sem Flexible no label).
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        wrap(
          LiveTableFullModeMesa(
            teamA: team('Alessandra Fernandes / Beatriz Albuquerque'),
            teamB: team('Constantino Silveira / Domingos Cavalcante'),
            scoreA: 18,
            scoreB: 16,
            isServingA: true,
            isServingB: false,
            timeoutsA: 1,
            timeoutsB: 0,
            enabled: true,
            onTapA: () {},
            onTapB: () {},
            onRemoveTimeoutA: () {},
            onRemoveTimeoutB: () {},
            onSwapServe: () {},
            onSwapSides: () {},
            onAddTimeout: () {},
            onUndo: () {},
            onMore: () {},
          ),
        ),
      );

      final overflows = <Object>[];
      for (;;) {
        final exception = tester.takeException();
        if (exception == null) break;
        overflows.add(exception);
      }
      expect(
        overflows,
        isEmpty,
        reason: 'nomes longos + chip SAQUE não podem estourar o painel',
      );
      expect(find.text('SAQUE'), findsOneWidget);
    },
  );

  testWidgets('LiveTableStartingServe pergunta e devolve a dupla escolhida', (
    tester,
  ) async {
    final chosen = <String>[];
    await tester.pumpWidget(
      wrap(
        LiveTableStartingServe(
          teamA: team('Marcos / Victor'),
          teamB: team('Igor / João'),
          onChoose: chosen.add,
        ),
      ),
    );

    expect(find.text('Quem começa sacando?'), findsOneWidget);
    expect(find.text('Marcos / Victor'), findsOneWidget);
    expect(find.text('Igor / João'), findsOneWidget);

    await tester.tap(find.text('Igor / João'));
    await tester.pump();

    expect(chosen, ['B']);
  });

  test('liveTableIsServing não acende SAQUE em ninguém sem saque definido', () {
    final match = TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'cat-1',
      round: 1,
      matchType: 'wb',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.inProgress,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
    );

    // Sem isto o app afirmava que a dupla A estava sacando só porque o campo nasce vazio.
    expect(liveTableIsServing(match, sideA: true), isFalse);
    expect(liveTableIsServing(match, sideA: false), isFalse);
  });

  test('liveTableTitleLabel uses category and round', () {
    final match = TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'cat-1',
      round: 3,
      matchType: 'wb',
      poolId: '',
      teamAId: 'a',
      teamBId: 'b',
      status: TournamentMatchStatus.inProgress,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 4,
    );

    expect(
      liveTableTitleLabel(match: match, categoryLabel: 'Masc Open'),
      contains('Masc Open'),
    );
  });
}
