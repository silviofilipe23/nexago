import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_waitlist_entry.dart';
import 'package:nexago_app/features/arenas/domain/waitlist_view_logic.dart';

final _now = DateTime(2026, 11, 10, 18);

ArenaBookingWaitlistEntry _e(
  String id, {
  String date = '2026-11-12',
  String start = '19:00',
  ArenaBookingWaitlistStatus status = ArenaBookingWaitlistStatus.waiting,
  DateTime? expiresAt,
  String? reason,
}) =>
    ArenaBookingWaitlistEntry(
      id: id,
      arenaId: 'a1',
      courtId: 'q1',
      dateKey: date,
      startTime: start,
      endTime: '20:00',
      athleteId: 'u1',
      status: status,
      expiresAt: expiresAt,
      expiredReason: reason,
    );

void main() {
  test('separa vaga liberada, aguardando e encerradas com o motivo', () {
    final view = buildWaitlistView([
      _e('oferta',
          status: ArenaBookingWaitlistStatus.notified,
          expiresAt: _now.add(const Duration(minutes: 10))),
      _e('fila'),
      _e('reservou', status: ArenaBookingWaitlistStatus.converted),
      _e('saiu',
          status: ArenaBookingWaitlistStatus.expired,
          reason: 'left_by_athlete'),
      _e('passou',
          status: ArenaBookingWaitlistStatus.expired, reason: 'slot_started'),
      _e('prazo', status: ArenaBookingWaitlistStatus.expired),
    ], _now);

    expect(view.offers.map((e) => e.id), ['oferta']);
    expect(view.waiting.map((e) => e.id), ['fila']);
    expect(view.activeCount, 2);
    expect(view.hasOffer, isTrue);
    final reasons = {for (final (e, r) in view.closed) e.id: r};
    expect(reasons, {
      'reservou': WaitlistClosedReason.converted,
      'saiu': WaitlistClosedReason.left,
      'passou': WaitlistClosedReason.slotStarted,
      'prazo': WaitlistClosedReason.offerExpired,
    });
  });

  test(
      'corrige o atraso do servidor: prazo vencido e horário começado já encerram',
      () {
    final view = buildWaitlistView([
      _e('prazo-vencido',
          status: ArenaBookingWaitlistStatus.notified,
          expiresAt: _now.subtract(const Duration(minutes: 1))),
      _e('hoje-cedo', date: '2026-11-10', start: '17:00'),
    ], _now);

    expect(view.activeCount, 0);
    final reasons = {for (final (e, r) in view.closed) e.id: r};
    expect(reasons['prazo-vencido'], WaitlistClosedReason.offerExpired);
    expect(reasons['hoje-cedo'], WaitlistClosedReason.slotStarted);
  });

  test('histórico só dos últimos 30 dias', () {
    final view = buildWaitlistView([
      _e('velha',
          date: '2026-09-01', status: ArenaBookingWaitlistStatus.converted),
    ], _now);
    expect(view.isEmpty, isTrue);
  });

  test('rótulos do histórico', () {
    expect(WaitlistClosedReason.converted.label, 'Virou reserva');
    expect(WaitlistClosedReason.offerExpired.label, 'Prazo acabou');
    expect(WaitlistClosedReason.slotStarted.label, 'Horário passou');
    expect(WaitlistClosedReason.left.label, 'Você saiu');
  });
}
