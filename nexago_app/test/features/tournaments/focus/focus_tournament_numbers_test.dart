import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_journey_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/focus_tournament_numbers.dart';

TournamentNumbers _numbers({
  int matches = 3,
  int setsWon = 4,
  int setsLost = 1,
  int points = 126,
  int pointsAgainst = 98,
  double pointsPerSet = 25.2,
  int setCount = 5,
}) {
  return TournamentNumbers(
    matches: matches,
    setsWon: setsWon,
    setsLost: setsLost,
    points: points,
    pointsAgainst: pointsAgainst,
    pointsPerSet: pointsPerSet,
    sets: [
      for (var i = 0; i < setCount; i++)
        SetBar(label: 'P1 · S${i + 1}', mine: 21, theirs: 15),
    ],
  );
}

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: AppTheme.dark,
    home: Scaffold(body: child),
  );
}

Color _colorOf(WidgetTester tester, String text) {
  return tester.widget<Text>(find.text(text)).style!.color!;
}

void main() {
  final dark = AppThemeColors.ofBrightness(Brightness.dark);

  group('FocusTournamentNumbers', () {
    testWidgets('mostra sets e pontos em dois cards, com o rótulo acima',
        (tester) async {
      await tester
          .pumpWidget(_wrap(FocusTournamentNumbers(numbers: _numbers())));

      expect(find.text('SETS'), findsOneWidget);
      expect(find.text('4–1'), findsOneWidget);
      expect(find.text('PONTOS'), findsOneWidget);
      expect(find.text('126'), findsOneWidget);
    });

    testWidgets('saldo de sets positivo sai na cor de vitória', (tester) async {
      await tester.pumpWidget(_wrap(
        FocusTournamentNumbers(numbers: _numbers(setsWon: 4, setsLost: 1)),
      ));

      expect(_colorOf(tester, '4–1'), dark.win);
    });

    testWidgets('saldo de sets negativo sai na cor de derrota', (tester) async {
      await tester.pumpWidget(_wrap(
        FocusTournamentNumbers(numbers: _numbers(setsWon: 1, setsLost: 4)),
      ));

      expect(_colorOf(tester, '1–4'), dark.live);
    });

    testWidgets('saldo de sets empatado fica neutro', (tester) async {
      await tester.pumpWidget(_wrap(
        FocusTournamentNumbers(numbers: _numbers(setsWon: 2, setsLost: 2)),
      ));

      expect(_colorOf(tester, '2–2'), dark.onSurface);
    });

    testWidgets('pontos por set usa vírgula decimal', (tester) async {
      await tester.pumpWidget(_wrap(
        FocusTournamentNumbers(numbers: _numbers(pointsPerSet: 25.2)),
      ));

      expect(find.text('25,2 / set'), findsOneWidget);
    });

    testWidgets('pontos por set redondo não mostra a casa decimal',
        (tester) async {
      await tester.pumpWidget(_wrap(
        FocusTournamentNumbers(numbers: _numbers(pointsPerSet: 25)),
      ));

      expect(find.text('25 / set'), findsOneWidget);
    });

    testWidgets('sem set encerrado troca os cards pela frase de vazio',
        (tester) async {
      await tester.pumpWidget(_wrap(
        FocusTournamentNumbers(
          numbers: _numbers(
            matches: 0,
            setsWon: 0,
            setsLost: 0,
            points: 0,
            pointsAgainst: 0,
            pointsPerSet: 0,
            setCount: 0,
          ),
        ),
      ));

      expect(find.text('Nenhuma partida encerrada ainda.'), findsOneWidget);
      expect(find.text('SETS'), findsNothing);
      expect(find.text('PONTOS'), findsNothing);
    });
  });
}
