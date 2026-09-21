import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_podiums.dart';

void main() {
  AthletePodium p(int place,
          {int year = 2026, DateTime? at, String nome = 'T'}) =>
      AthletePodium(
        tournamentId: '$nome$place$year',
        tournamentName: nome,
        place: place,
        year: year,
        completedAt: at,
      );

  group('isPodiumPlace', () {
    test('pódio é do primeiro ao terceiro', () {
      expect(isPodiumPlace(1), isTrue);
      expect(isPodiumPlace(2), isTrue);
      expect(isPodiumPlace(3), isTrue);
    });

    test('quarto lugar não é pódio', () {
      // O pedido foi explícito: colocações ACIMA de quarto lugar.
      expect(isPodiumPlace(4), isFalse);
      expect(isPodiumPlace(10), isFalse);
    });

    test('zero e negativo não passam', () {
      // `finalPlace` vem do Firestore e pode chegar zerado num doc incompleto.
      expect(isPodiumPlace(0), isFalse);
      expect(isPodiumPlace(-1), isFalse);
    });
  });

  group('sortPodiumsForDisplay', () {
    test('melhor colocação vem primeiro, mesmo sendo mais antiga', () {
      final out = sortPodiumsForDisplay([
        p(3, at: DateTime(2026, 9)),
        p(1, at: DateTime(2020, 1)),
        p(2, at: DateTime(2026, 8)),
      ]);

      expect(out.map((e) => e.place), [1, 2, 3]);
    });

    test('no empate de colocação, o mais recente na frente', () {
      final out = sortPodiumsForDisplay([
        p(1, at: DateTime(2024, 5), nome: 'velho'),
        p(1, at: DateTime(2026, 5), nome: 'novo'),
      ]);

      expect(out.first.tournamentName, 'novo');
    });

    test('sem data cai para o ano, e não quebra', () {
      final out = sortPodiumsForDisplay([
        p(1, year: 2023, nome: 'a'),
        p(1, year: 2026, nome: 'b'),
      ]);

      expect(out.first.tournamentName, 'b');
    });

    test('não muda a lista original', () {
      final entrada = [p(3), p(1)];
      final copia = [...entrada];
      sortPodiumsForDisplay(entrada);

      expect(entrada.map((e) => e.place), copia.map((e) => e.place));
    });
  });

  group('podiumCounts', () {
    test('conta por degrau', () {
      final c = podiumCounts([p(1), p(1), p(2), p(3), p(3), p(3)]);

      expect(c[1], 2);
      expect(c[2], 1);
      expect(c[3], 3);
    });

    test('ignora colocação fora do pódio', () {
      final c = podiumCounts([p(1), p(4), p(0)]);

      expect(c[1], 1);
      expect(c.values.fold(0, (a, b) => a + b), 1);
    });

    test('lista vazia devolve mapa vazio', () {
      expect(podiumCounts(const []), isEmpty);
    });
  });
}
