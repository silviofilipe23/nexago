import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_card_pills.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_day_timeline.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

final _now = DateTime(2026, 11, 18, 18, 40);
const _today = '2026-11-18';

ArenaManagerBooking _b(
  String id,
  String start,
  String end, {
  String court = 'Quadra 1',
  String dateKey = _today,
  Map<String, dynamic> data = const {},
}) =>
    ArenaManagerBooking(
      id: id,
      athleteId: 'ath-$id',
      courtId: court,
      courtName: court,
      dateKey: dateKey,
      startTime: start,
      endTime: end,
      data: {'status': 'active', ...data},
    );

List<String> _ids(List<ArenaTimelineEntry> entries) => [
      for (final e in entries)
        switch (e) {
          ArenaTimelineNowEntry() => 'agora',
          ArenaTimelineFreeEntry() => 'livre',
          ArenaTimelineBookingEntry(:final booking) => booking.id,
        },
    ];

void main() {
  group('buildArenaDayTimeline', () {
    test('segue o relógio, com o agora antes da próxima reserva', () {
      final entries = buildArenaDayTimeline(
        bookings: [
          _b('noite', '21:00', '22:00'),
          _b('cedo', '17:00', '18:00',
              data: {'attendanceStatus': 'checked_in'}),
          _b('quadra', '18:00', '19:30', court: 'Quadra 3'),
          _b('proxima', '19:00', '20:00', court: 'Quadra 2'),
          _b('mesma-hora', '19:00', '20:00', court: 'Quadra 1'),
        ],
        dateKey: _today,
        now: _now,
      );
      // Presença não muda a ordem: o check-in das 17h não "sobe".
      expect(
        _ids(entries),
        ['cedo', 'quadra', 'agora', 'mesma-hora', 'proxima', 'noite'],
      );
    });

    test('marca concluída, em quadra (com progresso) e por vir', () {
      final entries = buildArenaDayTimeline(
        bookings: [
          _b('cedo', '17:00', '18:00'),
          _b('quadra', '18:00', '19:30'),
          _b('noite', '21:00', '22:00'),
        ],
        dateKey: _today,
        now: _now,
      ).whereType<ArenaTimelineBookingEntry>().toList();

      expect(entries[0].phase, ArenaTimelinePhase.done);
      expect(entries[1].phase, ArenaTimelinePhase.live);
      expect(entries[1].minutesLeft, 50);
      expect(entries[1].progress, closeTo(40 / 90, 0.001));
      expect(entries[2].phase, ArenaTimelinePhase.upcoming);
      expect(entries.every((e) => e.isToday), isTrue);
    });

    test('dia acabado: agora vai no fim', () {
      final entries = buildArenaDayTimeline(
        bookings: [_b('cedo', '08:00', '09:00')],
        dateKey: _today,
        now: _now,
      );
      expect(_ids(entries), ['cedo', 'agora']);
    });

    test('cancelada e de outro dia ficam de fora', () {
      final entries = buildArenaDayTimeline(
        bookings: [
          _b('ok', '19:00', '20:00'),
          _b('cancelada', '20:00', '21:00', data: {'status': 'cancelled'}),
          _b('amanha', '19:00', '20:00', dateKey: '2026-11-19'),
        ],
        dateKey: _today,
        now: _now,
      );
      expect(_ids(entries), ['agora', 'ok']);
    });

    test('dia passado é todo concluído e sem agora; futuro, todo por vir', () {
      final past = buildArenaDayTimeline(
        bookings: [_b('x', '23:00', '23:59', dateKey: '2026-11-17')],
        dateKey: '2026-11-17',
        now: _now,
      );
      expect(_ids(past), ['x']);
      final entry = past.single as ArenaTimelineBookingEntry;
      expect(entry.phase, ArenaTimelinePhase.done);
      expect(entry.isToday, isFalse);

      final future = buildArenaDayTimeline(
        bookings: [_b('y', '07:00', '08:00', dateKey: '2026-11-19')],
        dateKey: '2026-11-19',
        now: _now,
      ).single as ArenaTimelineBookingEntry;
      expect(future.phase, ArenaTimelinePhase.upcoming);
    });
  });

  group('selos do card', () {
    test('presença: feito, chegando, atrasado, pendente e no-show', () {
      ArenaBookingPill? presence(ArenaManagerBooking b) =>
          arenaBookingPresencePill(b, now: _now);

      expect(
        presence(_b('a', '19:00', '20:00',
            data: {'attendanceStatus': 'checked_in'}))?.label,
        'Check-in feito',
      );
      expect(presence(_b('a', '19:00', '20:00'))?.label, 'Chega em 20 min');
      expect(presence(_b('a', '18:30', '19:30'))?.label, 'Atrasado · 10 min');
      expect(presence(_b('a', '18:30', '19:30'))?.tone, ArenaPillTone.live);
      expect(presence(_b('a', '21:00', '22:00'))?.label, 'Check-in pendente');
      expect(
        presence(_b('a', '19:00', '20:00', dateKey: '2026-11-19'))?.label,
        'Check-in pendente',
      );
      expect(
        presence(_b('a', '17:00', '18:00',
            data: {'attendanceStatus': 'no_show'}))?.label,
        'Não compareceu',
      );
    });

    test('aula e cancelada não têm selo de presença', () {
      expect(
        arenaBookingPresencePill(
          _b('class_t1_2026-11-18', '20:00', '21:00',
              data: {'isClassSession': true}),
          now: _now,
        ),
        isNull,
      );
      expect(
        arenaBookingPresencePill(
          _b('c', '20:00', '21:00', data: {'status': 'canceled'}),
          now: _now,
        ),
        isNull,
      );
    });

    test('pagamento: pago, sinal com restante, na arena e direto', () {
      final paid = _b('p', '19:00', '20:00', data: {
        'paymentChannel': 'card',
        'paymentStatus': 'paid',
        'amountReais': 160,
      });
      expect(arenaBookingPaymentPill(paid)?.label, 'Pago');
      expect(arenaBookingDueReais(paid), isNull);

      final deposit = _b('d', '19:00', '20:00', data: {
        'paymentChannel': 'pix',
        'paymentStatus': 'partial',
        'amountReais': 160,
        'amountPaidOnlineReais': 80,
      });
      expect(arenaBookingPaymentPill(deposit)?.label, 'Sinal pago');
      expect(arenaBookingDueReais(deposit), 80);

      final onsite = _b('o', '19:00', '20:00', data: {
        'paymentChannel': 'onsite',
        'amountReais': 120,
      });
      expect(arenaBookingPaymentPill(onsite)?.label, 'Pagar na arena');
      expect(arenaBookingDueReais(onsite), 120);

      expect(arenaBookingPaymentPill(_b('x', '19:00', '20:00')), isNull);
    });

    test('tipo: horário fixo, aula, professor e cancelada', () {
      final labels = arenaBookingTypePills(
        _b('r', '19:00', '20:00', data: {
          'isRecurring': true,
          'bookedAs': 'professor',
          'professorRelationshipType': 'INDEPENDENT',
        }),
      ).map((p) => p.label);
      expect(labels, ['Horário fixo', 'Professor · independente']);
      expect(
        arenaBookingTypePills(
          _b('c', '19:00', '20:00', data: {'status': 'canceled'}),
        ).single.label,
        'Cancelada',
      );
    });

    test('duração', () {
      expect(arenaBookingDurationLabel('19:00', '20:00'), '1h');
      expect(arenaBookingDurationLabel('18:00', '19:30'), '1h30');
      expect(arenaBookingDurationLabel('18:00', '18:45'), '45 min');
      expect(arenaBookingDurationLabel('23:00', '00:00'), '1h');
    });
  });

  group('resumo do dia', () {
    ArenaSlot slot(String court, String start, String status) => ArenaSlot(
          id: '$court-$start',
          arenaId: 'a1',
          courtId: court,
          date: DateTime(2026, 11, 18),
          startTime: start,
          endTime:
              '${(int.parse(start.substring(0, 2)) + 1).toString().padLeft(2, '0')}:00',
          rawStatus: status,
        );

    test('a receber ignora o que já acabou; ocupação sobre a grade livre', () {
      final bookings = [
        _b('cedo', '17:00', '18:00', court: 'q1', data: {
          'paymentChannel': 'onsite',
          'amountReais': 100,
        }),
        _b('quadra', '18:00', '19:00', court: 'q2', data: {
          'paymentChannel': 'pix',
          'paymentStatus': 'partial',
          'amountReais': 160,
          'amountPaidOnlineReais': 80,
        }),
        _b('noite', '21:00', '22:00', court: 'q1', data: {
          'paymentChannel': 'onsite',
          'amountReais': 120,
        }),
      ];
      final timeline =
          buildArenaDayTimeline(bookings: bookings, dateKey: _today, now: _now);
      final summary = buildArenaBookingsDaySummary(
        timeline: timeline,
        dayBookings: bookings,
        daySlots: [
          slot('q1', '17:00', 'available'),
          slot('q2', '18:00', 'available'),
          slot('q1', '21:00', 'available'),
          slot('q2', '21:00', 'available'),
          slot('q2', '22:00', 'blocked'),
        ],
        dateKey: _today,
      );
      expect(summary.bookings, 3);
      expect(summary.live, 1);
      expect(summary.dueReais, 80 + 120);
      // 3 de 4 horários não bloqueados vendidos.
      expect(summary.occupancyPercent, 75);
    });

    test('sem grade, ocupação fica de fora', () {
      final summary = buildArenaBookingsDaySummary(
        timeline: const [],
        dayBookings: const [],
        daySlots: const [],
        dateKey: _today,
      );
      expect(summary.occupancyPercent, isNull);
      expect(summary.dueReais, 0);
    });
  });
}
