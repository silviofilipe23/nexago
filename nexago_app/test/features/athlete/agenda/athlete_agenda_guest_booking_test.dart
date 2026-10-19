import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';

/// Reserva de outro atleta em que o usuário entrou por convite: aparece na
/// Agenda, mas pagamento e presença continuam sendo do dono.
void main() {
  MyBookingItem booking({
    String id = 'b1',
    String owner = 'owner',
    String status = 'pending_payment',
  }) =>
      MyBookingItem(
        id: id,
        ownerAthleteId: owner,
        arenaName: 'Arena Sol',
        courtName: 'Quadra 2',
        dateRaw: '2026-10-24',
        startTime: '19:00',
        endTime: '20:00',
        rawStatus: status,
        amountReais: 120,
        paymentDisplay: const MyBookingPaymentDisplay(label: ''),
      );

  final now = DateTime(2026, 10, 24, 10);

  test('convidado não vê "Pagar" nem presença pendente; subtítulo marca', () {
    final guest = mapBookingToAgendaItem(
      booking(),
      now: now,
      currentAthleteUid: 'ana',
    );
    expect(guest?.subtitle, 'Quadra 2 · convidado');
    expect(guest?.rental?.needsPayment, isFalse);
    expect(guest?.rental?.attendancePending, isFalse);
  });

  test('dono segue como antes', () {
    final own = mapBookingToAgendaItem(
      booking(),
      now: now,
      currentAthleteUid: 'owner',
    );
    expect(own?.subtitle, 'Quadra 2');
    expect(own?.rental?.attendancePending, isTrue);
  });

  test('junta as listas sem repetir a reserva', () {
    final merged = mergeOwnAndGuestBookings(
      [booking(id: 'mine', owner: 'ana')],
      [booking(id: 'mine', owner: 'ana'), booking(id: 'theirs')],
    );
    expect(merged.map((b) => b.id), ['mine', 'theirs']);
    expect(
      mergeOwnAndGuestBookings([booking(id: 'mine')], const []),
      hasLength(1),
    );
  });
}
