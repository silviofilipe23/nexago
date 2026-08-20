import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_day_offer.dart';

void main() {
  group('focusOfferKey', () {
    test('a chave usa o dia do fuso do evento, não o do aparelho', () {
      // 01:00Z de 21/08 ainda é 22h de 20/08 em São Paulo.
      final noite = DateTime.utc(2026, 8, 21, 1);
      final tarde = DateTime.utc(2026, 8, 20, 18);

      expect(focusOfferKey('u1', noite), focusOfferKey('u1', tarde));
    });
  });

  group('FocusDayOffer', () {
    test('oferece uma vez por dia por uid', () {
      final offer = FocusDayOffer();
      final now = DateTime(2026, 8, 20, 9);

      expect(offer.shouldOffer('u1', now), isTrue);
      offer.markOffered('u1', now);
      expect(offer.shouldOffer('u1', now), isFalse);
    });

    test('dia seguinte reoferece', () {
      final offer = FocusDayOffer();
      offer.markOffered('u1', DateTime(2026, 8, 20, 22));

      expect(offer.shouldOffer('u1', DateTime(2026, 8, 21, 8)), isTrue);
    });

    test('outro uid reoferece — troca de conta sem matar o app', () {
      final offer = FocusDayOffer();
      final now = DateTime(2026, 8, 20, 9);
      offer.markOffered('u1', now);

      expect(offer.shouldOffer('u2', now), isTrue);
    });

    test('uid vazio nunca oferece', () {
      final offer = FocusDayOffer();

      expect(offer.shouldOffer('', DateTime(2026, 8, 20, 9)), isFalse);
    });
  });
}
