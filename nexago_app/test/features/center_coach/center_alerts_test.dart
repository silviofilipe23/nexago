import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_alerts.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';

void main() {
  test('categoria, tom e título pela ação', () {
    expect(centerAlertCategory('invoice.refund'), CenterAlertCategory.finance);
    expect(centerAlertCategory('plan.price'), CenterAlertCategory.finance);
    expect(centerAlertCategory('plan.created'), CenterAlertCategory.other);
    expect(
        centerAlertCategory('session.checkin'), CenterAlertCategory.schedule);
    expect(
      centerAlertCategory('enrollment.paused'),
      CenterAlertCategory.enrollments,
    );
    expect(centerAlertCategory('member.joined'), CenterAlertCategory.team);
    expect(centerAlertTone('session.cancelled'), 'red');
    expect(centerAlertTone('invoice.manual_confirm'), 'green');
    expect(centerAlertTone('center.profile'), 'mute');
    expect(centerAlertTitle('enrollment.seat_offered'), 'Vaga oferecida');
    expect(centerAlertTitle('invoice.novo_tipo'), 'Financeiro');
  });

  test('grupos por dia do centro: Hoje, Ontem e dia da semana', () {
    final groups = centerAlertGroups(
      [
        CenterAuditEntry(
            id: 'c', action: 'x', at: DateTime.utc(2026, 10, 21, 12)),
        CenterAuditEntry(
            id: 'a', action: 'x', at: DateTime.utc(2026, 10, 23, 12)),
        const CenterAuditEntry(id: 'sem-data', action: 'x'),
        CenterAuditEntry(
            id: 'b', action: 'x', at: DateTime.utc(2026, 10, 22, 12)),
        CenterAuditEntry(
            id: 'a2', action: 'x', at: DateTime.utc(2026, 10, 23, 9)),
      ],
      todayKey: '2026-10-23',
      localDayKey: (at) =>
          '${at.year}-${at.month.toString().padLeft(2, '0')}-${at.day.toString().padLeft(2, '0')}',
    );
    expect(groups.map((g) => g.$1), ['Hoje', 'Ontem', 'Qua 21/10']);
    expect(groups.first.$2.map((e) => e.id), ['a', 'a2']);
  });

  test('ocupação da aula', () {
    const cls = CenterCoachClass(
      id: 'k',
      name: 'T',
      capacity: 6,
      rosterStudentIds: ['a', 'b', 'c'],
    );
    final s = CenterCoachSession.fromMap('s', {
      'makeupStudentIds': ['m1', 'a'],
    });
    final o = centerSessionOccupancy(cls, s);
    expect((o.enrolled, o.makeups, o.free), (3, 1, 2));
    expect(
      centerSessionOccupancy(
        const CenterCoachClass(id: 'k', name: 'T'),
        s,
      ).free,
      isNull,
    );
  });
}
