import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_group_standings_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_pool_standings_widgets.dart';

void main() {
  final group = TournamentPoolStandingsGroup(
    poolId: 'A',
    poolLabel: 'Grupo A',
    teamCount: 2,
    matchCount: 1,
    isComplete: false,
    rows: [
      TournamentPoolStandingsRow(
        rank: 1,
        teamId: 't1',
        displayName: 'Dupla A',
        wins: 1,
        losses: 0,
        setsWon: 2,
        setsLost: 0,
        gamesWon: 21,
        gamesLost: 10,
        points: 2,
        qualifies: true,
        isAthleteTeam: false,
      ),
    ],
  );

  Future<void> pumpCard(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentPoolStandingsCard(
              group: group,
              qualifiersPerGroup: 2,
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('explica as siglas no rodapé do card', (tester) async {
    await pumpCard(tester);

    // Sem o hover do portal, PF/PT/SP ficam ilegíveis se ninguém disser o que são.
    final legend = find.textContaining('SP saldo');
    expect(legend, findsOneWidget);

    final text = tester.widget<Text>(legend).data!;
    expect(text, contains('PF feitos'));
    expect(text, contains('PT tomados'));
  });

  testWidgets('mantém a regra de classificação no rodapé do card', (tester) async {
    await pumpCard(tester);

    expect(
      find.textContaining('Top 2 de cada grupo avançam'),
      findsOneWidget,
    );
  });
}
