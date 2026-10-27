import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/rating_reliability.dart';

void main() {
  group('ratingReliabilityFor', () {
    test('RD mínimo (piso do backend) é Alta', () {
      expect(ratingReliabilityFor(kMinGlickoRd), RatingReliability.alta);
    });

    test('RD abaixo do limite de decisão da escada é Alta', () {
      expect(ratingReliabilityFor(100), RatingReliability.alta);
    });

    test('RD exatamente no limite de decisão (120) ainda é Alta', () {
      expect(ratingReliabilityFor(120), RatingReliability.alta);
    });

    // Antes o corte era 150: entre 121 e 150 o card dizia "Alta" e a escada
    // (maxRdForDecision = 120) não subia o atleta.
    test('RD acima do limite de decisão já é Média', () {
      expect(ratingReliabilityFor(120.01), RatingReliability.media);
      expect(ratingReliabilityFor(150), RatingReliability.media);
    });

    test('o corte de Alta segue o limite vigente da escada', () {
      expect(
        ratingReliabilityFor(150, highMaxRd: 160),
        RatingReliability.alta,
      );
      expect(
        ratingReliabilityFor(110, highMaxRd: 100),
        RatingReliability.media,
      );
    });

    test('RD no meio da faixa central é Média', () {
      expect(ratingReliabilityFor(200), RatingReliability.media);
    });

    test('RD exatamente no corte Média/Baixa (250) ainda é Média', () {
      expect(ratingReliabilityFor(250), RatingReliability.media);
    });

    test('RD logo acima do corte Média/Baixa (250) já é Baixa', () {
      expect(ratingReliabilityFor(250.01), RatingReliability.baixa);
    });

    test('RD no meio da faixa superior é Baixa', () {
      expect(ratingReliabilityFor(300), RatingReliability.baixa);
    });

    test('RD máximo (teto do backend) é Baixa', () {
      expect(ratingReliabilityFor(kMaxGlickoRd), RatingReliability.baixa);
    });

    test('valores fora da faixa real saturam na categoria mais próxima', () {
      expect(ratingReliabilityFor(0), RatingReliability.alta);
      expect(ratingReliabilityFor(1000), RatingReliability.baixa);
    });
  });

  group('RatingReliability.label', () {
    test('rótulos PT-BR', () {
      expect(RatingReliability.alta.label, 'Alta');
      expect(RatingReliability.media.label, 'Média');
      expect(RatingReliability.baixa.label, 'Baixa');
    });
  });
}
