import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_waitlist.dart';

String _day(DateTime at) =>
    '${at.year}-${at.month.toString().padLeft(2, '0')}-${at.day.toString().padLeft(2, '0')}';
String _hm(DateTime at) =>
    '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';

CenterCoachEnrollment _e(
  String id,
  String classId,
  String status, {
  DateTime? waitlistedAt,
  DateTime? offeredAt,
  DateTime? holdUntil,
  String cancelReason = '',
  String offeredBy = 'auto',
}) =>
    CenterCoachEnrollment(
      id: id,
      studentId: 's$id',
      classId: classId,
      status: status,
      studentName: 'Aluno $id',
      waitlistedAt: waitlistedAt,
      offeredAt: offeredAt,
      holdUntil: holdUntil,
      cancelReason: cancelReason,
      offeredBy: offeredBy,
    );

void main() {
  final now = DateTime.utc(2026, 10, 23, 15);

  test('agrupa por turma: fila em ordem, ofertas abertas e anteriores', () {
    final list = buildCenterWaitlist(
      enrollments: [
        _e('b', 'k1', 'waitlisted', waitlistedAt: DateTime.utc(2026, 10, 19)),
        _e('a', 'k1', 'waitlisted', waitlistedAt: DateTime.utc(2026, 10, 18)),
        _e('c', 'k1', 'waitlisted'),
        _e('o', 'k1', 'pending', offeredAt: DateTime.utc(2026, 10, 23)),
        _e('x', 'k1', 'active', offeredAt: DateTime.utc(2026, 10, 2)),
        _e('old', 'k1', 'active', offeredAt: DateTime.utc(2026, 8, 1)),
        _e('n', 'k1', 'active'),
        _e('z', 'k2', 'waitlisted'),
        _e('q', 'k3', 'active'),
      ],
      classes: const [
        CenterCoachClass(id: 'k1', name: 'BT A', capacity: 6, seatsTaken: 6),
        CenterCoachClass(id: 'k2', name: 'BT B'),
      ],
      now: now,
    );
    expect(list.map((c) => c.classId), ['k1', 'k2'], reason: 'k3 sem fila');
    final k1 = list.first;
    expect(k1.queue.map((e) => e.id), ['a', 'b', 'c']);
    expect(k1.offers.map((e) => e.id), ['o']);
    expect(k1.past.map((e) => e.id), ['x'], reason: 'só últimos 30 dias');
    expect(k1.freeSeats, 0);
    expect(list[1].freeSeats, isNull);
    expect(centerQueueSize(list), 4);
  });

  test('linhas da fila e das ofertas', () {
    expect(
      centerQueueLine(
        _e('a', 'k', 'waitlisted', waitlistedAt: DateTime.utc(2026, 10, 18)),
        planNames: const {},
        localDayKey: _day,
      ),
      'Desde 18/10',
    );
    expect(
      centerOfferLine(
        _e(
          'o',
          'k',
          'pending',
          offeredAt: now.subtract(const Duration(hours: 3)),
          holdUntil: DateTime.utc(2026, 10, 24, 12),
          offeredBy: 'manual',
        ),
        now: now,
        localDayKey: _day,
        localHm: _hm,
      ),
      'Oferecida há 3h · pela equipe · paga até 24/10 12:00',
    );
    expect(
      centerPastOfferLine(
        _e('h', 'k', 'cancelled',
            offeredAt: DateTime.utc(2026, 9, 28), cancelReason: 'hold_expired'),
        localDayKey: _day,
      ),
      ('Não pagou no prazo · passou a vez · 28/09', 'mute'),
    );
    expect(
      centerPastOfferLine(
        _e('h', 'k', 'active', offeredAt: DateTime.utc(2026, 10, 2)),
        localDayKey: _day,
      ),
      ('Aceitou · oferta de 02/10', 'green'),
    );
  });
}
