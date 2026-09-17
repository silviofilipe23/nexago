import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_pool_standings_widgets.dart';

void main() {
  Future<void> pumpFooter(WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentGroupStandingsFooter(qualifiersPerGroup: 2),
          ),
        ),
      ),
    );
  }

  testWidgets('explica as siglas da tabela', (tester) async {
    await pumpFooter(tester);

    // Sem o hover do portal, PF/PT/SP ficam ilegíveis se ninguém disser o que são.
    final legend = find.textContaining('saldo de pontos');
    expect(legend, findsOneWidget);

    final text = tester.widget<Text>(legend).data!;
    expect(text, contains('pontos feitos'));
    expect(text, contains('pontos tomados'));
  });

  testWidgets('mantém a regra de classificação', (tester) async {
    await pumpFooter(tester);

    expect(
      find.textContaining('avançam para a próxima fase'),
      findsOneWidget,
    );
  });
}
