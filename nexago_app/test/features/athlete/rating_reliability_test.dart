import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/rating_reliability.dart';

void main() {
  group('ratingReliabilityFor', () {
    test('RD mínimo (piso do backend) é Alta', () {
      expect(ratingReliabilityFor(kMinGlickoRd), RatingReliability.alta);
    });

    test('RD no meio do terço inferior é Alta', () {
      expect(ratingReliabilityFor(100), RatingReliability.alta);
    });

    test('RD exatamente no corte Alta/Média (150) ainda é Alta', () {
      expect(ratingReliabilityFor(150), RatingReliability.alta);
    });

    test('RD logo acima do corte Alta/Média (150) já é Média', () {
      expect(ratingReliabilityFor(150.01), RatingReliability.media);
    });

    test('RD no meio do terço central é Média', () {
      expect(ratingReliabilityFor(200), RatingReliability.media);
    });

    test('RD exatamente no corte Média/Baixa (250) ainda é Média', () {
      expect(ratingReliabilityFor(250), RatingReliability.media);
    });

    test('RD logo acima do corte Média/Baixa (250) já é Baixa', () {
      expect(ratingReliabilityFor(250.01), RatingReliability.baixa);
    });

    test('RD no meio do terço superior é Baixa', () {
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
