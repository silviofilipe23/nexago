import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/manual_booking_slot_chain.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

/// Reserva de balcão em horários seguidos: a partir do horário tocado, quais
/// os próximos livres, colados um no outro, na mesma quadra e dia.
void main() {
  final day = DateTime(2026, 11, 14);

  ArenaSlot slot(
    String start,
    String end, {
    String court = 'c1',
    String status = 'available',
    DateTime? date,
    double? price = 100,
  }) {
    return ArenaSlot(
      id: '$court-$start',
      arenaId: 'a1',
      courtId: court,
      date: date ?? day,
      startTime: start,
      endTime: end,
      rawStatus: status,
      priceReais: price,
    );
  }

  group('consecutiveAvailableSlots', () {
    test('segue enquanto o próximo começa onde o anterior termina', () {
      final start = slot('18:00', '19:00');
      final chain = consecutiveAvailableSlots(start, [
        slot('20:00', '21:00'),
        start,
        slot('19:00', '20:00'),
        slot('22:00', '23:00'), // buraco às 21h
      ]);
      expect(chain.map((s) => s.startTime), ['18:00', '19:00', '20:00']);
    });

    test('para no horário ocupado ou bloqueado', () {
      final start = slot('18:00', '19:00');
      final booked = consecutiveAvailableSlots(start, [
        start,
        slot('19:00', '20:00', status: 'booked'),
        slot('20:00', '21:00'),
      ]);
      expect(booked, [start]);

      final blocked = consecutiveAvailableSlots(start, [
        start,
        slot('19:00', '20:00', status: 'blocked'),
      ]);
      expect(blocked, [start]);
    });

    test('ignora outra quadra e outro dia', () {
      final start = slot('18:00', '19:00');
      final chain = consecutiveAvailableSlots(start, [
        start,
        slot('19:00', '20:00', court: 'c2'),
        slot('19:00', '20:00', date: DateTime(2026, 11, 15)),
      ]);
      expect(chain, [start]);
    });

    test('sem a lista do dia fica só o horário tocado', () {
      final start = slot('18:00', '19:00');
      expect(consecutiveAvailableSlots(start, const []), [start]);
    });

    test('para na meia-noite', () {
      final start = slot('23:00', '00:00');
      final chain = consecutiveAvailableSlots(start, [
        slot('00:00', '01:00'), // primeiro horário do mesmo dia, não o seguinte
        start,
      ]);
      expect(chain, [start]);
    });

    test('aceita grade de 30 min e horário sem zero à esquerda', () {
      final start = slot('8:00', '8:30');
      final chain = consecutiveAvailableSlots(start, [
        start,
        slot('08:30', '09:00'),
        slot('09:00', '09:30'),
      ]);
      expect(chain.length, 3);
    });

    test('respeita o limite de horários', () {
      final start = slot('08:00', '09:00');
      final day = [
        start,
        for (var h = 9; h < 20; h++)
          slot(
            '${h.toString().padLeft(2, '0')}:00',
            '${(h + 1).toString().padLeft(2, '0')}:00',
          ),
      ];
      expect(
        consecutiveAvailableSlots(start, day).length,
        kMaxManualBookingSlots,
      );
      expect(consecutiveAvailableSlots(start, day, max: 3).length, 3);
    });
  });

  group('sumSlotPrices', () {
    test('soma os preços dos horários', () {
      expect(
        sumSlotPrices([slot('18:00', '19:00'), slot('19:00', '20:00')]),
        200,
      );
    });

    test('algum horário sem preço: sem sugestão', () {
      expect(
        sumSlotPrices([
          slot('18:00', '19:00'),
          slot('19:00', '20:00', price: null),
        ]),
        isNull,
      );
    });
  });

  group('slotSpanMinutes', () {
    test('conta do início do primeiro ao fim do último', () {
      expect(slotSpanMinutes('18:00', '20:30'), 150);
      expect(slotSpanMinutes('22:00', '00:00'), 120);
      expect(slotSpanMinutes('xx', '20:00'), 0);
    });
  });
}
