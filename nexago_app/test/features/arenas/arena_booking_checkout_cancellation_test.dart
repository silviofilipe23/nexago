import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_cancellation_policy.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/athlete_cancel_policy.dart';

// Política na tela de confirmar reserva: prazo como data e hora reais e texto
// conforme a forma de pagamento.

typedef P = ArenaBookingCancellationPolicy;

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  // Quarta, 25/11/2026, 19:00 → prazo grátis até 13:00 do mesmo dia.
  final start = DateTime(2026, 11, 25, 19);

  group('deadlineLabel', () {
    test('mesmo dia vira "hoje"', () {
      expect(
        P.deadlineLabel(DateTime(2026, 11, 25, 13), DateTime(2026, 11, 25, 8)),
        'hoje às 13:00',
      );
    });

    test('dia seguinte vira "amanhã"', () {
      expect(
        P.deadlineLabel(
            DateTime(2026, 11, 25, 13), DateTime(2026, 11, 24, 23, 59)),
        'amanhã às 13:00',
      );
    });

    test('mais longe: dia da semana sem ponto e data', () {
      expect(
        P.deadlineLabel(DateTime(2026, 11, 25, 13), DateTime(2026, 11, 19, 10)),
        'qua, 25/11 às 13:00',
      );
    });
  });

  group('checkoutCancellationTitle', () {
    final now = DateTime(2026, 11, 19, 10);

    test('pagando na arena é grátis mesmo com política parcial', () {
      expect(
        P.checkoutCancellationTitle(
          bookingStart: start,
          now: now,
          policy: AthleteCancelPolicy.fromRaw({'refundPercent': 50}),
          paysOnline: false,
        ),
        'Cancelamento grátis até qua, 25/11 às 13:00',
      );
    });

    test('pagando pelo app com estorno integral é grátis', () {
      expect(
        P.checkoutCancellationTitle(
          bookingStart: start,
          now: now,
          policy: AthleteCancelPolicy.full,
          paysOnline: true,
        ),
        'Cancelamento grátis até qua, 25/11 às 13:00',
      );
    });

    test('pagando pelo app com estorno parcial não promete "grátis"', () {
      expect(
        P.checkoutCancellationTitle(
          bookingStart: start,
          now: now,
          policy: AthleteCancelPolicy.fromRaw({'refundPercent': 50}),
          paysOnline: true,
        ),
        'Cancelamento até qua, 25/11 às 13:00',
      );
    });

    test('a menos de 6h do horário não há prazo a mostrar', () {
      expect(
        P.checkoutCancellationTitle(
          bookingStart: start,
          now: DateTime(2026, 11, 25, 14),
          policy: AthleteCancelPolicy.full,
          paysOnline: true,
        ),
        'Sem cancelamento pelo app',
      );
    });
  });

  group('checkoutCancellationSubtitle', () {
    final now = DateTime(2026, 11, 19, 10);

    test('na arena não fala de estorno por Pix ou cartão', () {
      final text = P.checkoutCancellationSubtitle(
        'Arena CFC',
        AthleteCancelPolicy.full,
        bookingStart: start,
        now: now,
        paysOnline: false,
      );
      expect(text, contains('combinado com a Arena CFC'));
      expect(text, isNot(contains('Pix')));
    });

    test('pelo app mantém o texto do estorno da política', () {
      expect(
        P.checkoutCancellationSubtitle(
          'Arena CFC',
          AthleteCancelPolicy.full,
          bookingStart: start,
          now: now,
          paysOnline: true,
        ),
        P.cancellationSubtitle('Arena CFC', AthleteCancelPolicy.full),
      );
    });

    test('a menos de 6h avisa antes de confirmar', () {
      expect(
        P.checkoutCancellationSubtitle(
          'Arena CFC',
          AthleteCancelPolicy.full,
          bookingStart: start,
          now: DateTime(2026, 11, 25, 14),
          paysOnline: false,
        ),
        startsWith('Falta menos de 6h para o horário'),
      );
    });
  });

  test('startsAt junta o dia e o horário de início', () {
    final args = ArenaBookingConfirmArgs(
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      courtId: 'q2',
      courtName: 'Quadra 2',
      date: DateTime(2026, 11, 25),
      startTime: '19:30',
      endTime: '20:30',
      amountReais: 70,
      selectedSlotStartTimes: const ['19:30'],
    );
    expect(args.startsAt, DateTime(2026, 11, 25, 19, 30));
  });
}
