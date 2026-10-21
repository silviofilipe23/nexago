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

    test('linhas todas com desconto: rótulo sem ressalva', () {
      const quote = ArenaBookingQuote(
        amountReais: 160,
        lineItems: [
          ArenaBookingQuoteLine(
            startTime: '15:00',
            endTime: '16:00',
            finalSlotPriceReais: 80,
            baseSlotPriceReais: 100,
          ),
          ArenaBookingQuoteLine(
            startTime: '16:00',
            endTime: '17:00',
            finalSlotPriceReais: 80,
            baseSlotPriceReais: 100,
          ),
        ],
        professorDiscountPercent: 20,
        professorDiscountReais: 40,
      );
      expect(quote.professorDiscountIsPartial, isFalse);
      expect(quote.professorDiscountLabel, 'Desconto de professor (20%)');
    });

    test('faixa 08–17 numa reserva 16–18: desconto só em parte', () {
      const quote = ArenaBookingQuote(
        amountReais: 180,
        lineItems: [
          ArenaBookingQuoteLine(
            startTime: '16:00',
            endTime: '17:00',
            finalSlotPriceReais: 80,
            baseSlotPriceReais: 100,
          ),
          ArenaBookingQuoteLine(
            startTime: '17:00',
            endTime: '18:00',
            finalSlotPriceReais: 100,
            baseSlotPriceReais: 100,
          ),
        ],
        professorDiscountPercent: 20,
        professorDiscountReais: 20,
      );
      expect(quote.professorDiscountIsPartial, isTrue);
      expect(
        quote.professorDiscountLabel,
        'Desconto de professor (20% em parte dos horários)',
      );
      expect(quote.professorDiscountValueLabel, '−${formatBRL(20)}');
      expect(quote.amountBeforeProfessorDiscountReais, 200);
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
