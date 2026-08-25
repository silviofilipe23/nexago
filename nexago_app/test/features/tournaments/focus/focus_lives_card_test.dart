import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_double_elimination.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_lives_card.dart';

Widget _inList(FocusBracketSide side) {
  return MaterialApp(
    home: Scaffold(
      // A seção Agora é um ListView — altura ILIMITADA para os filhos. É o
      // contexto em que o card quebrava.
      body: ListView(
        children: [
          FocusBracketSideCards(
            standing: FocusDoubleEliminationStanding(
              side: side,
              lives: side == FocusBracketSide.winners ? 2 : 1,
              lastLossPhase: side == FocusBracketSide.winners ? null : 'Quartas',
            ),
            winnersLabel: 'Você está aqui · QF',
            losersLabel: 'Uma derrota e acabou, com texto bem mais longo',
          ),
        ],
      ),
    ),
  );
}

void main() {
  // Regressão: `CrossAxisAlignment.stretch` manda a altura do Row como
  // restrição apertada aos filhos. Num ListView essa altura é infinita, e o
  // layout estourava — a seção Agora quebrava em TODA categoria de dupla
  // eliminação, não só para quem já tinha perdido.
  for (final side in FocusBracketSide.values) {
    testWidgets('os dois lados desenham dentro de um ListView ($side)',
        (tester) async {
      await tester.pumpWidget(_inList(side));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('VENCEDORES'), findsOneWidget);
      expect(find.text('REPESCAGEM'), findsOneWidget);
    });
  }

  testWidgets('os dois cards terminam na mesma altura', (tester) async {
    // O ponto do `stretch`: textos de tamanhos diferentes, cards iguais.
    await tester.pumpWidget(_inList(FocusBracketSide.winners));
    await tester.pumpAndSettle();

    final left = tester.getRect(find.text('VENCEDORES'));
    final right = tester.getRect(find.text('REPESCAGEM'));
    expect(left.top, right.top);
  });
}
