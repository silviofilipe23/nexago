import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_quote.dart';

void main() {
  group('ArenaBookingQuote — desconto de professor', () {
    test('rótulos do resumo com desconto', () {
      const quote = ArenaBookingQuote(
        amountReais: 80,
        lineItems: [],
        professorDiscountPercent: 20,
        professorDiscountReais: 20,
      );
      expect(quote.hasProfessorDiscount, isTrue);
      expect(quote.professorDiscountLabel, 'Desconto de professor (20%)');
      expect(quote.professorDiscountValueLabel, '−${formatBRL(20)}');
      expect(quote.amountBeforeProfessorDiscountReais, 100);
    });

    test('sem desconto: rótulos nulos', () {
      const quote = ArenaBookingQuote(amountReais: 100, lineItems: []);
      expect(quote.hasProfessorDiscount, isFalse);
      expect(quote.professorDiscountLabel, isNull);
      expect(quote.professorDiscountValueLabel, isNull);
      expect(quote.amountBeforeProfessorDiscountReais, 100);
    });
  });
}
