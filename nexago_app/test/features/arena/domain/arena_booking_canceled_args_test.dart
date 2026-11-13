import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_canceled_args.dart';

/// Horário que a reserva cancelada liberou: base do "Criar reserva" da tela
/// pós-cancelamento.
void main() {
  group('arenaReleasedSlot', () {
    test('monta o horário livre da quadra', () {
      final slot = arenaReleasedSlot(
        arenaId: 'a1',
        courtId: 'c1',
        dateKey: '2026-11-14',
        startTime: '19:00',
        endTime: '20:00',
      );

      expect(slot, isNotNull);
      expect(slot!.arenaId, 'a1');
      expect(slot.courtId, 'c1');
      expect(slot.dateKey, '2026-11-14');
      expect(slot.startTime, '19:00');
      expect(slot.endTime, '20:00');
      expect(slot.isAvailable, isTrue);
    });

    test('reserva antiga sem quadra não libera horário reservável', () {
      expect(
        arenaReleasedSlot(
          arenaId: 'a1',
          courtId: '  ',
          dateKey: '2026-11-14',
          startTime: '19:00',
          endTime: '20:00',
        ),
        isNull,
      );
    });

    test('data ou horário inválidos: null', () {
      expect(
        arenaReleasedSlot(
          arenaId: 'a1',
          courtId: 'c1',
          dateKey: '',
          startTime: '19:00',
          endTime: '20:00',
        ),
        isNull,
      );
      expect(
        arenaReleasedSlot(
          arenaId: 'a1',
          courtId: 'c1',
          dateKey: '2026-11-14',
          startTime: '',
          endTime: '20:00',
        ),
        isNull,
      );
      expect(
        arenaReleasedSlot(
          arenaId: '',
          courtId: 'c1',
          dateKey: '2026-11-14',
          startTime: '19:00',
          endTime: '20:00',
        ),
        isNull,
      );
    });
  });
}
