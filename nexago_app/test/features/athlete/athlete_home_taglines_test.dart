import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_home_taglines.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_home_hero.dart';

const _codes = [
  'VOLEI_PRAIA',
  'VOLEI_QUADRA',
  'FUTEVOLEI',
  'FUTEBOL',
  'BASQUETE',
  'TENIS',
  'BEACH_TENNIS',
  'CORRIDA',
  'PADEL',
  'OUTROS',
];

void main() {
  group('athleteHomeTaglines', () {
    for (final code in _codes) {
      test('$code: 30 frases distintas e curtas', () {
        final phrases = athleteHomeTaglines[code]!;

        expect(phrases, hasLength(30));
        expect(phrases.toSet(), hasLength(30));
        for (final phrase in phrases) {
          expect(
            phrase.length,
            lessThanOrEqualTo(56),
            reason: '"$phrase" não cabe em duas linhas ao lado do avatar',
          );
        }
      });
    }
  });

  group('athleteHomeTaglineFor', () {
    final day = DateTime(2026, 10, 29, 8);

    test('frase do esporte do perfil, pelo código ou pelo rótulo', () {
      expect(
        athleteHomeTaglines['BEACH_TENNIS'],
        contains(athleteHomeTaglineFor(sport: 'BEACH_TENNIS', now: day)),
      );
      expect(
        athleteHomeTaglines['FUTEVOLEI'],
        contains(athleteHomeTaglineFor(sport: 'Futevôlei', now: day)),
      );
    });

    test('sem esporte ou esporte desconhecido cai nas gerais', () {
      final outros = athleteHomeTaglines['OUTROS']!;
      expect(outros, contains(athleteHomeTaglineFor(now: day)));
      expect(
        outros,
        contains(athleteHomeTaglineFor(sport: 'xadrez', now: day)),
      );
    });

    test('a frase fica a mesma o dia todo e troca no dia seguinte', () {
      String at(DateTime t) =>
          athleteHomeTaglineFor(sport: 'VOLEI_PRAIA', now: t, seed: 'u1');

      expect(at(DateTime(2026, 10, 29, 0, 5)), at(DateTime(2026, 10, 29, 23)));
      expect(at(DateTime(2026, 10, 29, 12)), isNot(at(DateTime(2026, 10, 30))));
    });

    test('atletas diferentes veem frases diferentes no mesmo dia', () {
      final a = athleteHomeTaglineFor(sport: 'PADEL', now: day, seed: 'a');
      final b = athleteHomeTaglineFor(sport: 'PADEL', now: day, seed: 'b');

      expect(a, isNot(b));
    });

    test('passa pelas 30 frases em 30 dias', () {
      final seen = {
        for (var i = 0; i < 30; i++)
          athleteHomeTaglineFor(
            sport: 'TENIS',
            now: DateTime(2026, 1, 1).add(Duration(days: i)),
            seed: 'u1',
          ),
      };

      expect(seen, hasLength(30));
    });
  });

  final longest = athleteHomeTaglines.values
      .expand((list) => list)
      .reduce((a, b) => a.length >= b.length ? a : b);

  // A largura real não dá pra medir aqui: no flutter_test cada letra é um
  // quadrado do tamanho da fonte, bem mais larga que a Sora. Quem garante
  // as duas linhas é o teto de 56 caracteres acima; aqui só não pode estourar.
  Future<void> pumpAt(WidgetTester tester, double width) async {
    tester.view.physicalSize = Size(width, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: MediaQueryData(
            size: Size(width, 640),
            padding: const EdgeInsets.only(top: 59),
          ),
          child: Scaffold(
            body: AthleteHomeHero(
              name: 'Fernandinha',
              gender: 'Feminino',
              tagline: longest,
              leading: const SizedBox(width: 56, height: 56),
              onIdentityTap: () {},
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('a frase mais longa não estoura o topo numa tela de 320',
      (tester) async {
    await pumpAt(tester, 320);

    expect(tester.takeException(), isNull);
  });
}
