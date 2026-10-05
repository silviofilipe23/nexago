import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';

/// A reserva não guarda esporte: a agenda não pode afirmar "Vôlei de praia" numa locação de
/// quadra de beach tennis (multiesporte). Subtítulo = só a quadra.
void main() {
  MyBookingItem booking({String? courtName}) => MyBookingItem(
    id: 'b1',
    arenaName: 'Arena Sol',
    courtName: courtName,
    dateRaw: '2026-10-10',
    startTime: '18:00',
    endTime: '19:00',
    rawStatus: 'confirmed',
    paymentDisplay: const MyBookingPaymentDisplay(label: ''),
  );

  test('subtítulo da locação é a quadra, sem esporte inventado', () {
    final item = mapBookingToAgendaItem(
      booking(courtName: 'Quadra 2'),
      now: DateTime(2026, 10, 1),
    );
    expect(item?.subtitle, 'Quadra 2');
  });

  test('sem nome de quadra, subtítulo vazio (não "Vôlei de praia")', () {
    final item = mapBookingToAgendaItem(booking(), now: DateTime(2026, 10, 1));
    expect(item?.subtitle, isNot(contains('Vôlei')));
  });
}
