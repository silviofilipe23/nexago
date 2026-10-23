import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';

CenterCoachSession session({
  String status = 'scheduled',
  String date = '2026-10-23',
  String coachUid = 'tm',
  Map<String, Object?> extra = const {},
}) => CenterCoachSession.fromMap('k1_$date', {
  'classId': 'k1',
  'className': 'BT Intermediário B',
  'date': date,
  'startTime': '19:00',
  'durationMin': 90,
  'coachUid': coachUid,
  'status': status,
  'attendance': {'s1': 'present', 'x': 'absent', 'lixo': 'talvez'},
  'makeupStudentIds': ['m1'],
  'rsvps': {
    's2': {'response': 'not_going'},
    's3': {'response': 'going'},
  },
  'attendanceByStudent': {'s2': true},
  'effectsApplied': {
    's1': {'credit': -1, 'makeup': 0},
  },
  ...extra,
});

const cls = CenterCoachClass(
  id: 'k1',
  name: 'BT Intermediário B',
  rosterStudentIds: ['s1', 's2', 's3'],
  capacity: 6,
  seatsTaken: 3,
);

void main() {
  group('vínculo e permissão', () {
    test('papel + extraPerms espelham as rules', () {
      final coach = CenterMembership.fromMap('c1', {
        'role': 'coach',
        'status': 'active',
        'extraPerms': ['view_finance'],
      });
      expect(coach.has('attendance'), isTrue);
      expect(coach.has('enroll_students'), isFalse);
      expect(coach.seesAllStudents, isTrue, reason: 'view_finance extra');
      final revoked = CenterMembership.fromMap('c1', {
        'role': 'coach',
        'status': 'revoked',
      });
      expect(revoked.has('attendance'), isFalse);
      expect(revoked.isRevoked, isTrue);
    });

    test(
      'chamada só do professor da data, no dia ou depois, sem cancelada',
      () {
        final m = CenterMembership.fromMap('c1', {
          'role': 'coach',
          'status': 'active',
        });
        bool can(
          CenterCoachSession s, {
          String uid = 'tm',
          String today = '2026-10-23',
        }) => coachCanTakeAttendance(
          member: m,
          center: null,
          session: s,
          uid: uid,
          todayKey: today,
        );
        expect(can(session()), isTrue);
        expect(can(session(), uid: 'outro'), isFalse);
        expect(can(session(date: '2026-10-25')), isFalse);
        expect(can(session(status: 'cancelled')), isFalse);
        expect(
          coachCanTakeAttendance(
            member: m,
            center: const CenterCoachCenter(
              id: 'c1',
              name: 'CT',
              status: 'suspended',
            ),
            session: session(),
            uid: 'tm',
            todayKey: '2026-10-23',
          ),
          isFalse,
        );
      },
    );
  });

  group('chamada', () {
    test('lê a aula: marcas válidas, respostas do app, efeitos e fim', () {
      final s = session();
      expect(s.attendance, {'s1': CenterMark.present, 'x': CenterMark.absent});
      expect(s.rsvps, {'s2': 'not_going', 's3': 'going'});
      expect(s.endTime, '20:30');
      expect(s.effects['s1'], (credit: -1, makeup: 0));
    });

    test('lista: turma, reposição e quem saiu mas tem marca', () {
      final s = session();
      final rows = buildRollCall(
        session: s,
        cls: cls,
        marks: s.attendance,
        makeupIds: s.makeupStudentIds,
        students: {
          's1': const CenterCoachStudent(
            id: 's1',
            name: 'Marina Teles',
            billingHold: true,
          ),
        },
        extraNames: const {'m1': 'Igor Martins'},
      );
      expect(rows.map((r) => r.studentId), ['s1', 's2', 's3', 'm1', 'x']);
      expect(rows[0].name, 'Marina Teles');
      expect(rows[0].hold, isTrue);
      expect(rows[3].makeup, isTrue);
      expect(rows[3].name, 'Igor Martins');
      expect(rows[4].former, isTrue);
      expect(rsvpLabel(rows[1]), 'Avisou no prazo · app');
      expect(rsvpLabel(rows[2]), 'Vai · app');
      expect(effectLabel(rows[0].effect), '−1 crédito do pacote');
      final c = rollCallCounts(rows);
      expect((c.present, c.excused, c.absent, c.unmarked), (1, 0, 1, 3));
    });

    test('consequência da finalização pelas regras do centro', () {
      const p = CenterCoachPolicies(makeupValidityDays: 30);
      const strict = CenterCoachPolicies(
        excusedAbsenceMakeup: false,
        unexcusedAbsenceConsumes: false,
      );
      const present = RollCallRow(
        studentId: 'a',
        name: 'A',
        mark: CenterMark.present,
      );
      const excused = RollCallRow(
        studentId: 'a',
        name: 'A',
        mark: CenterMark.excused,
      );
      const absent = RollCallRow(
        studentId: 'a',
        name: 'A',
        mark: CenterMark.absent,
      );
      const makeup = RollCallRow(
        studentId: 'a',
        name: 'A',
        mark: CenterMark.present,
        makeup: true,
      );
      expect(finalizeConsequence(present, p), 'Aula usada do plano');
      expect(
        finalizeConsequence(excused, p),
        contains('reposição por 30 dias'),
      );
      expect(finalizeConsequence(excused, strict), contains('sem reposição'));
      expect(finalizeConsequence(absent, strict), contains('não consome'));
      expect(finalizeConsequence(makeup, p), 'Crédito de reposição consumido');
    });

    test('correção exige marca diferente e justificativa', () {
      expect(
        correctionError(CenterMark.absent, CenterMark.absent, 'motivo'),
        isNotNull,
      );
      expect(
        correctionError(CenterMark.absent, CenterMark.present, 'ok'),
        isNotNull,
      );
      expect(
        correctionError(
          CenterMark.absent,
          CenterMark.present,
          'Chegou atrasado',
        ),
        isNull,
      );
    });

    test('texto da auditoria igual ao do portal', () {
      final s = session();
      expect(
        attendanceAuditDetail(
          s,
          const RollCallCounts(4, 1, 1, 0),
          finalize: true,
        ),
        'BT Intermediário B · 23/10 19:00: chamada finalizada (4 P · 1 J · 1 F)',
      );
    });

    test('presença da turma só conta aulas finalizadas', () {
      expect(classPresencePercent([session(), session(status: 'done')]), 50);
      expect(classPresencePercent([session()]), isNull);
    });

    test('semana e deslocamento de dias', () {
      expect(coachWeekKeys('2026-10-29').last, '2026-11-04');
      expect(coachShiftDay('2026-11-01', -1), '2026-10-31');
    });
  });

  test('experimental na aula: lê o espelho do servidor e segura a vaga', () {
    final s = CenterCoachSession.fromMap('k1_x', {
      'classId': 'k1',
      'date': '2026-10-23',
      'startTime': '19:00',
      'makeupStudentIds': ['m1'],
      'trials': {
        'uB': {'name': 'Bruno', 'status': 'confirmed', 'photoUrl': 'https://x/b.jpg'},
        'uA': {'name': 'Ana', 'status': 'pending', 'photoUrl': ''},
        'lixo': 'x',
      },
    });
    expect(s.trials.map((t) => t.name), ['Ana', 'Bruno']);
    expect(s.trials.first.isPending, isTrue);
    expect(s.trials.first.photoUrl, isNull);
    expect(s.trials.last.photoUrl, 'https://x/b.jpg');
    const cls = CenterCoachClass(
      id: 'k1',
      name: 'Kids',
      capacity: 5,
      rosterStudentIds: ['s1', 's2'],
    );
    final o = centerSessionOccupancy(cls, s);
    expect((o.enrolled, o.makeups, o.trials, o.free), (2, 1, 2, 0));
    expect(
      CenterCoachSession.fromMap('k', const {'classId': 'k1'}).trials,
      isEmpty,
    );
  });
}
