import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/win_probability.dart';

void main() {
  group('winProbability', () {
    test('ratings iguais → 50%', () {
      expect(
        winProbability(ratingA: 1500, ratingB: 1500),
        closeTo(0.5, 0.0001),
      );
    });

    test('diferença de 400 pontos → ~90.9% para o favorito', () {
      // Fórmula logística padrão: 1 / (1 + 10^(-400/400)) = 1/(1+0.1).
      expect(
        winProbability(ratingA: 1900, ratingB: 1500),
        closeTo(10 / 11, 0.0001),
      );
    });

    test('simétrica: p(A vence) + p(B vence) == 1', () {
      final pA = winProbability(ratingA: 1620, ratingB: 1480);
      final pB = winProbability(ratingA: 1480, ratingB: 1620);
      expect(pA + pB, closeTo(1.0, 1e-9));
    });

    test('rating maior sempre implica probabilidade > 50%', () {
      expect(winProbability(ratingA: 1550, ratingB: 1500) > 0.5, isTrue);
      expect(winProbability(ratingA: 1450, ratingB: 1500) < 0.5, isTrue);
    });

    test('resultado sempre entre 0 e 1', () {
      expect(winProbability(ratingA: 3000, ratingB: 500) < 1, isTrue);
      expect(winProbability(ratingA: 500, ratingB: 3000) > 0, isTrue);
    });
  });

  group('compositeTeamRating', () {
    test('média simples de dois ratings', () {
      expect(compositeTeamRating([1600, 1400]), 1500);
    });

    test('jogador único (dupla incompleta) devolve o próprio rating', () {
      expect(compositeTeamRating([1550]), 1550);
    });

    test('lista vazia → default 1500 (mesmo default do backend)', () {
      expect(compositeTeamRating([]), 1500);
    });
  });
}
