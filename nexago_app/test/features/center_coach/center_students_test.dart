import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_students.dart';

CenterCoachInvoice _inv(String status, String due, {String student = 's1'}) =>
    CenterCoachInvoice(
      id: '$status$due',
      status: status,
      amountCents: 100,
      dueDate: due,
      studentId: student,
    );

void main() {
  const today = '2026-10-23';

  test('situação financeira: atrasado > aguardando > em dia', () {
    expect(centerFinanceOf(const [], today), isNull);
    expect(
      centerFinanceOf([_inv('cancelled', '2026-01-01')], today),
      isNull,
      reason: 'cancelada não conta',
    );
    final late = centerFinanceOf([
      _inv('approved', '2026-09-10'),
      _inv('pending', '2026-10-30'),
      _inv('pending', '2026-10-10'),
    ], today)!;
    expect(late.state, CenterFinanceState.late);
    expect(late.note, 'Venceu 10/10');
    expect(
      centerFinanceOf([_inv('pending', '2026-10-30')], today)!.note,
      'Vence 30/10',
    );
    expect(
      centerFinanceOf([_inv('failed', '2026-10-30')], today)!.state,
      CenterFinanceState.late,
    );
    expect(
      centerFinanceOf([_inv('approved', '2026-10-01')], today)!.state,
      CenterFinanceState.ok,
    );
  });

  test('linhas: turma pela matrícula, ou pela turma quando não lê matrícula',
      () {
    const students = [
      CenterCoachStudent(id: 's1', name: 'Zé'),
      CenterCoachStudent(id: 's2', name: 'Álvaro', billingHold: true),
      CenterCoachStudent(id: 's3', name: 'Inativo', status: 'inactive'),
    ];
    const classes = [
      CenterCoachClass(
          id: 'k1', name: 'Turma A', rosterStudentIds: ['s1', 's2']),
    ];
    final asCoach = buildCenterStudentRows(
      students: students,
      enrollments: const [],
      classes: classes,
      invoices: null,
      todayKey: today,
    );
    expect(asCoach.map((r) => r.student.name), ['Álvaro', 'Zé']);
    expect(asCoach.first.className, 'Turma A');
    expect(asCoach.first.hasPending, isTrue, reason: 'bloqueio sem financeiro');
    final asStaff = buildCenterStudentRows(
      students: students,
      enrollments: const [
        CenterCoachEnrollment(
            id: 'e1',
            studentId: 's1',
            classId: 'k1',
            status: 'active',
            className: 'A',
            planName: 'Mensal'),
        CenterCoachEnrollment(
            id: 'e2',
            studentId: 's1',
            classId: 'k2',
            status: 'paused',
            className: 'B',
            planName: 'Mensal'),
        CenterCoachEnrollment(
            id: 'e3',
            studentId: 's1',
            classId: 'k3',
            status: 'cancelled',
            className: 'C'),
      ],
      classes: classes,
      invoices: [_inv('pending', '2026-10-30')],
      todayKey: today,
    );
    final ze = asStaff.firstWhere((r) => r.student.id == 's1');
    expect(ze.className, 'A +1');
    expect(ze.planName, 'Mensal');
    expect(ze.finance!.state, CenterFinanceState.pending);
  });

  test('busca ignora acento e caixa; filtros', () {
    const r = CenterStudentRow(
      student: CenterCoachStudent(
          id: 's', name: 'José Antônio', isMinor: true, makeupCredits: 1),
      className: '—',
      planName: '—',
    );
    expect(
        centerStudentMatches(r, CenterStudentFilter.all, 'jose ant'), isTrue);
    expect(centerStudentMatches(r, CenterStudentFilter.minors, ''), isTrue);
    expect(centerStudentMatches(r, CenterStudentFilter.credits, ''), isTrue);
    expect(centerStudentMatches(r, CenterStudentFilter.pending, ''), isFalse);
    expect(centerStudentMatches(r, CenterStudentFilter.all, 'maria'), isFalse);
  });

  test('marcas recentes, resumo, idade e contato', () {
    CenterCoachSession s(String id, String date, String? mark,
            {String status = 'done'}) =>
        CenterCoachSession.fromMap(id, {
          'date': date,
          'startTime': '19:00',
          'status': status,
          'attendance': {if (mark != null) 's1': mark},
        });
    final marks = centerStudentMarks([
      s('a', '2026-10-22', 'present'),
      s('b', '2026-10-20', 'absent'),
      s('c', '2026-10-21', 'present', status: 'cancelled'),
      s('d', '2026-10-24', 'present'),
      s('e', '2026-10-19', null),
    ], 's1', today);
    expect(marks.map((m) => m.date), ['2026-10-20', '2026-10-22']);
    expect(centerPresenceSummary(marks), '50% · 1 de 2');
    expect(centerPresenceSummary(const []), 'Sem chamada registrada');
    expect(centerAgeOn('2010-10-24', today), 15);
    expect(centerAgeOn('2010-10-23', today), 16);
    expect(centerAgeOn('', today), isNull);
    expect(centerWhatsAppDigits('(21) 99876-5432'), '5521998765432');
    expect(centerWhatsAppDigits('+55 21 99876-5432'), '5521998765432');
    expect(centerWhatsAppDigits('1234'), isNull);
    // Chat do app: maior, ativo e com conta.
    expect(
      centerStudentCanChat(
        const CenterCoachStudent(id: 'a', name: 'A', uid: 'u'),
      ),
      isTrue,
    );
    expect(
      centerStudentCanChat(const CenterCoachStudent(id: 'b', name: 'B')),
      isFalse,
    );
    expect(
      centerStudentCanChat(
        const CenterCoachStudent(id: 'c', name: 'C', uid: 'u', isMinor: true),
      ),
      isFalse,
    );
    const minor = CenterCoachStudent(
        id: 'm', name: 'M', isMinor: true, phone: '1', guardianPhone: '2');
    expect(centerContactPhone(minor), '2');
  });
}
