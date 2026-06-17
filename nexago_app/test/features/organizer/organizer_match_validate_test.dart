import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_validate_widgets.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';

TournamentMatch _match({
  String? teamADescription,
  String? teamBDescription,
  bool teamAConfirmed = true,
  bool teamBConfirmed = false,
  List<TournamentMatchSet> sets = const [],
}) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: 3,
    matchType: 'wb',
    poolId: '',
    teamAId: 'a',
    teamBId: 'b',
    status: 'completed',
    resultA: '2',
    resultB: '1',
    isGroupMatch: false,
    matchNumber: 12,
    teamADescription: teamADescription ?? 'Léo / Tiago',
    teamBDescription: teamBDescription ?? 'Pedro / Lucas',
    sets: sets,
    teamAConfirmed: teamAConfirmed,
    teamBConfirmed: teamBConfirmed,
    reportStatus: 'pending',
    matchEndedAt: DateTime.now().subtract(const Duration(minutes: 2)),
  );
}

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: AppTheme.dark,
    home: Scaffold(body: child),
  );
}

void main() {
  testWidgets('ValidatePageHeader shows title', (tester) async {
    await tester.pumpWidget(
      _wrap(
        ValidatePageHeader(onBack: () {}),
      ),
    );

    expect(find.text('VALIDAÇÃO DE RESULTADO'), findsOneWidget);
    expect(find.text('Confirmar placar'), findsOneWidget);
  });

  testWidgets('ValidateScoreCard shows teams and sets', (tester) async {
    final match = _match(
      sets: const [
        TournamentMatchSet(a: 21, b: 18),
        TournamentMatchSet(a: 18, b: 21),
        TournamentMatchSet(a: 15, b: 12),
      ],
    );

    await tester.pumpWidget(
      _wrap(
        ValidateScoreCard(
          match: match,
          categoryMeta: 'FEM OPEN · QUARTAS',
          teamA: const LiveTableTeamData(
            label: 'Léo / Tiago',
            player1: OrganizerCategoryPlayerInfo(uid: 'a-0', name: 'Léo'),
            player2: OrganizerCategoryPlayerInfo(uid: 'a-1', name: 'Tiago'),
          ),
          teamB: const LiveTableTeamData(
            label: 'Pedro / Lucas',
            player1: OrganizerCategoryPlayerInfo(uid: 'b-0', name: 'Pedro'),
            player2: OrganizerCategoryPlayerInfo(uid: 'b-1', name: 'Lucas'),
          ),
          setsWonA: 2,
          setsWonB: 1,
          sets: match.sets,
        ),
      ),
    );

    expect(find.text('Léo / Tiago'), findsOneWidget);
    expect(find.text('Pedro / Lucas'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    expect(find.text('SET 1'), findsOneWidget);
  });

  test('validateReporterName uses confirmed team', () {
    final match = _match(teamAConfirmed: true, teamBConfirmed: false);
    expect(
      validateReporterName(match: match),
      'Léo',
    );
  });

  test('validateReporterSubtitle includes relative time', () {
    final match = _match();
    expect(validateReporterSubtitle(match), contains('há'));
    expect(validateReporterSubtitle(match), contains('aguardando'));
  });
}
