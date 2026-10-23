import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_agenda_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_call_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_class_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

// Sex 23/10/2026 12:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 23, 15);

CenterCoachSession _session(
  String id, {
  String date = '2026-10-23',
  String start = '19:00',
  String status = 'scheduled',
  String coachUid = 'tm',
  Map<String, Object?> extra = const {},
}) => CenterCoachSession.fromMap(id, {
  'classId': 'k1',
  'className': 'BT Intermediário B',
  'date': date,
  'startTime': start,
  'durationMin': 60,
  'coachUid': coachUid,
  'coachName': coachUid == 'tm' ? 'Thiago' : 'Paula',
  'courtName': 'Quadra 2',
  'locationName': 'Sede Barra',
  'status': status,
  ...extra,
});

class _Fake implements CenterCoachRepository {
  _Fake({
    this.memberships = const [],
    this.sessions = const [],
    this.students = const [],
  });

  List<CenterMembership> memberships;
  List<CenterCoachSession> sessions;
  final List<CenterCoachStudent> students;
  CenterCoachException? failWith;
  final saves = <Map<String, Object?>>[];
  final corrections = <Map<String, Object?>>[];

  @override
  Stream<List<CenterMembership>> watchMemberships(String uid) =>
      Stream.value(memberships);

  @override
  Stream<CenterCoachCenter?> watchCenter(String centerId) => Stream.value(
    CenterCoachCenter(id: centerId, name: 'CT Maré Alta', status: 'active'),
  );

  @override
  Stream<List<CenterCoachSession>> watchSessions(
    String centerId, {
    required String fromKey,
    required String toKey,
  }) => Stream.value(sessions);

  @override
  Stream<CenterCoachSession?> watchSession(String centerId, String sessionId) =>
      Stream.value(sessions.where((s) => s.id == sessionId).firstOrNull);

  @override
  Stream<List<CenterCoachSession>> watchClassSessions(
    String centerId,
    String classId, {
    required String fromKey,
    required String toKey,
  }) => Stream.value(
    [
      for (final s in sessions)
        if (s.classId == classId) s,
    ]..sort((a, b) => b.date.compareTo(a.date)),
  );

  @override
  Stream<List<CenterCoachClass>> watchClasses(String centerId) =>
      Stream.value(const [
        CenterCoachClass(
          id: 'k1',
          name: 'BT Intermediário B',
          coachUid: 'tm',
          weekdays: [2, 4],
          startTime: '19:00',
          courtName: 'Quadra 2',
          capacity: 6,
          seatsTaken: 3,
          rosterStudentIds: ['s1', 's2', 's3'],
        ),
      ]);

  @override
  Stream<List<CenterCoachStudent>> watchStudents(
    String centerId, {
    required String uid,
    required bool all,
  }) => Stream.value(students);

  @override
  Future<void> saveAttendance({
    required String centerId,
    required CenterCoachSession session,
    required Map<String, CenterMark> marks,
    required List<String> makeupIds,
    required bool finalize,
    required String actorUid,
    required String actorName,
    required bool audit,
  }) async {
    if (failWith != null) throw failWith!;
    saves.add({
      'session': session.id,
      'marks': {for (final e in marks.entries) e.key: centerMarkValue(e.value)},
      'makeups': makeupIds,
      'finalize': finalize,
      'audit': audit,
    });
  }

  @override
  Future<void> correctAttendance({
    required String centerId,
    required CenterCoachSession session,
    required String studentId,
    required String studentName,
    required CenterMark to,
    required String reason,
    required String actorUid,
    required String actorName,
  }) async {
    corrections.add({
      'student': studentId,
      'to': centerMarkValue(to),
      'reason': reason,
    });
  }

  @override
  Future<List<MakeupCandidate>> makeupCandidates(
    String centerId,
    String sessionId,
  ) async => const [
    MakeupCandidate(id: 'm1', name: 'Igor Martins', makeupCredits: 1),
    MakeupCandidate(id: 's1', name: 'Marina Teles', makeupCredits: 1),
  ];
}

const _students = [
  CenterCoachStudent(id: 's1', name: 'Marina Teles'),
  CenterCoachStudent(id: 's2', name: 'Caio Ramos'),
  CenterCoachStudent(id: 's3', name: 'Elisa Prado', billingHold: true),
];

CenterMembership _member(
  String centerId,
  String name, {
  String status = 'active',
}) => CenterMembership.fromMap(centerId, {
  'centerName': name,
  'role': 'coach',
  'status': status,
  'displayName': 'Thiago Mendes',
});

Future<GoRouter> _pump(WidgetTester tester, String location, _Fake fake) async {
  tester.view.physicalSize = const Size(420, 2000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(path: AppRoutes.home, builder: (_, __) => const Scaffold()),
      GoRoute(
        path: AppRoutes.centerCoachAgenda,
        name: AppRouteNames.centerCoachAgenda,
        builder: (_, s) =>
            CenterCoachAgendaPage(centerId: s.uri.queryParameters['centro']),
      ),
      GoRoute(
        path: AppRoutes.centerCoachSession,
        name: AppRouteNames.centerCoachSession,
        builder: (_, s) => CenterCoachCallPage(
          centerId: s.pathParameters['centerId']!,
          sessionId: s.pathParameters['sessionId']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.centerCoachClass,
        name: AppRouteNames.centerCoachClass,
        builder: (_, s) => CenterCoachClassPage(
          centerId: s.pathParameters['centerId']!,
          classId: s.pathParameters['classId']!,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue('tm'),
        professorLinksClockProvider.overrideWithValue(() => _now),
        centerCoachRepositoryProvider.overrideWithValue(fake),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await _settle(tester);
  return router;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await _settle(tester);
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('P1/P2 · agenda', () {
    testWidgets('próxima aula, aulas do dia, turmas e troca de centro', (
      tester,
    ) async {
      final fake = _Fake(
        memberships: [
          _member('c1', 'CT Maré Alta'),
          _member('c2', 'Norte Beach'),
        ],
        sessions: [
          _session(
            'k1_a',
            start: '07:00',
            status: 'done',
            extra: {
              'attendance': {'s1': 'present'},
            },
          ),
          _session(
            'k1_b',
            extra: {
              'rsvps': {
                's2': {'response': 'not_going'},
              },
              'makeupStudentIds': ['m1'],
            },
          ),
          _session('k1_c', start: '20:30', status: 'cancelled'),
          _session('k1_other', start: '21:00', coachUid: 'paula'),
        ],
      );
      final router = await _pump(tester, AppRoutes.centerCoachAgenda, fake);
      expect(find.byKey(const Key('center-coach-next')), findsOneWidget);
      expect(
        find.text('1 aluno avisou falta · 1 entra com reposição.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('center-coach-row-k1_a')), findsOneWidget);
      expect(
        find.byKey(const Key('center-coach-row-k1_other')),
        findsNothing,
        reason: 'aula de outro professor não entra',
      );
      expect(find.text('1/1 presentes · finalizada'), findsOneWidget);
      expect(find.byKey(const Key('center-coach-class-k1')), findsOneWidget);

      await _tap(tester, find.byKey(const Key('center-coach-switch')));
      expect(
        find.byKey(const Key('center-coach-switch-sheet')),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('center-coach-option-c2')));
      expect(find.text('NORTE BEACH · PROFESSOR'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('center-coach-switch')));
      await _tap(tester, find.byKey(const Key('center-coach-option-c1')));
      await _tap(tester, find.byKey(const Key('center-coach-open-call')));
      expect(router.state.uri.path, '/athlete/professor/centros/c1/aula/k1_b');
    });

    testWidgets('P9 · vínculo revogado e sem centro', (tester) async {
      await _pump(
        tester,
        AppRoutes.centerCoachAgenda,
        _Fake(memberships: [_member('c1', 'CT Maré Alta', status: 'revoked')]),
      );
      expect(find.byKey(const Key('center-coach-revoked')), findsOneWidget);
    });
  });

  group('P3–P7 · chamada', () {
    _Fake callFake({
      Map<String, Object?> extra = const {},
      String status = 'scheduled',
    }) => _Fake(
      memberships: [_member('c1', 'CT Maré Alta')],
      students: _students,
      sessions: [
        _session(
          'k1_b',
          status: status,
          extra: {
            'attendance': {'s2': 'excused'},
            'attendanceByStudent': {'s2': true},
            'rsvps': {
              's2': {'response': 'not_going'},
            },
            ...extra,
          },
        ),
      ],
    );

    testWidgets('marca, salva sozinha e mantém a falta que o aluno avisou', (
      tester,
    ) async {
      final fake = callFake();
      await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', fake);
      expect(find.text('Avisou no prazo · app'), findsOneWidget);
      expect(find.text('PENDÊNCIA'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-mark-s1-present')));
      expect(fake.saves, isEmpty, reason: 'espera o toque seguinte');
      await tester.pump(kCallAutosaveDelay + const Duration(milliseconds: 100));
      await _settle(tester);
      expect(fake.saves.single['marks'], {'s2': 'excused', 's1': 'present'});
      expect(fake.saves.single['finalize'], isFalse);
      expect(fake.saves.single['audit'], isFalse);
    });

    testWidgets('finalizar exige todos marcados; resumo e confirmação', (
      tester,
    ) async {
      final fake = callFake();
      await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', fake);
      await _tap(tester, find.byKey(const Key('center-coach-finish')));
      expect(find.textContaining('2 sem marcação'), findsOneWidget);
      // O aviso some antes do próximo toque no rodapé.
      await tester.pump(const Duration(seconds: 5));
      await _settle(tester);
      await _tap(tester, find.byKey(const Key('center-coach-mark-all')));
      await _tap(tester, find.byKey(const Key('center-coach-finish')));
      expect(
        find.byKey(const Key('center-coach-finish-sheet')),
        findsOneWidget,
      );
      expect(find.text('Aula usada do plano'), findsOneWidget);
      expect(find.textContaining('mensalidade em atraso'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-coach-finish-confirm')));
      expect(fake.saves.last['finalize'], isTrue);
      expect(fake.saves.last['audit'], isTrue);
      expect(fake.saves.last['marks'], {
        's2': 'excused',
        's1': 'present',
        's3': 'present',
      });
    });

    testWidgets('encaixar reposição e tirar da aula', (tester) async {
      final fake = callFake();
      await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', fake);
      await _tap(tester, find.byKey(const Key('center-coach-add-makeup')));
      expect(
        find.byKey(const Key('center-coach-makeup-s1')),
        findsNothing,
        reason: 'quem já está na lista não aparece',
      );
      await _tap(tester, find.byKey(const Key('center-coach-makeup-m1')));
      await _tap(tester, find.byKey(const Key('center-coach-makeup-confirm')));
      expect(fake.saves.last['makeups'], ['m1']);
      expect(find.text('Igor Martins'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-coach-remove-m1')));
      await tester.pump(kCallAutosaveDelay + const Duration(milliseconds: 100));
      await _settle(tester);
      expect(fake.saves.last['makeups'], isEmpty);
    });

    testWidgets(
      'finalizada: histórico do registro e correção com justificativa',
      (tester) async {
        final fake = callFake(
          status: 'done',
          extra: {
            'attendance': {'s1': 'absent', 's2': 'excused', 's3': 'present'},
            'finalizedByName': 'Thiago Mendes',
            'effectsApplied': {
              's1': {'credit': -1, 'makeup': 0},
            },
          },
        );
        await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', fake);
        expect(find.byKey(const Key('center-coach-finish')), findsNothing);
        await _tap(tester, find.byKey(const Key('center-coach-student-s1')));
        expect(
          find.byKey(const Key('center-coach-record-sheet')),
          findsOneWidget,
        );
        expect(find.text('Créditos: −1 crédito do pacote'), findsOneWidget);
        await _tap(
          tester,
          find.byKey(const Key('center-coach-record-correct')),
        );
        expect(
          find.byKey(const Key('center-coach-correct-sheet')),
          findsOneWidget,
        );
        await _tap(tester, find.byKey(const Key('center-coach-correct-save')));
        expect(find.text('Explique o motivo da correção.'), findsOneWidget);
        await tester.enterText(
          find.byKey(const Key('center-coach-correct-reason')),
          'Chegou atrasado pela quadra 3',
        );
        await _tap(tester, find.byKey(const Key('center-coach-correct-save')));
        expect(fake.corrections.single, {
          'student': 's1',
          'to': 'present',
          'reason': 'Chegou atrasado pela quadra 3',
        });
      },
    );

    testWidgets('aula de outro professor fica só para consulta', (
      tester,
    ) async {
      final fake = _Fake(
        memberships: [_member('c1', 'CT Maré Alta')],
        sessions: [_session('k1_x', coachUid: 'paula')],
      );
      await _pump(tester, '/athlete/professor/centros/c1/aula/k1_x', fake);
      expect(
        find.byKey(const Key('center-coach-call-readonly')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('center-coach-finish')), findsNothing);
    });

    testWidgets('P9 · acesso caiu ao salvar: aviso no lugar da chamada', (
      tester,
    ) async {
      final fake = callFake()
        ..failWith = const CenterCoachException('sem acesso', revoked: true);
      await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', fake);
      await _tap(tester, find.byKey(const Key('center-mark-s1-present')));
      await tester.pump(kCallAutosaveDelay + const Duration(milliseconds: 100));
      await _settle(tester);
      expect(
        find.byKey(const Key('center-coach-call-revoked')),
        findsOneWidget,
      );
      expect(
        find.text('A presença que estava sendo marcada não foi salva.'),
        findsOneWidget,
      );
    });
  });

  group('P8 · turma', () {
    testWidgets('presença, aulas e alunos', (tester) async {
      final fake = _Fake(
        memberships: [_member('c1', 'CT Maré Alta')],
        students: _students,
        sessions: [
          _session(
            'k1_20',
            date: '2026-10-20',
            status: 'done',
            extra: {
              'attendance': {'s1': 'present', 's2': 'absent', 's3': 'present'},
              'attendanceLog': [
                {
                  'studentId': 's2',
                  'from': 'present',
                  'to': 'absent',
                  'reason': 'x',
                },
              ],
            },
          ),
          _session(
            'k1_15',
            date: '2026-10-15',
            status: 'cancelled',
            extra: {'changeReason': 'chuva'},
          ),
        ],
      );
      await _pump(tester, '/athlete/professor/centros/c1/turma/k1', fake);
      expect(find.text('67%'), findsOneWidget);
      expect(find.text('3/6'), findsOneWidget);
      expect(find.text('Finalizada · 1 correção'), findsOneWidget);
      expect(find.text('Cancelada · chuva'), findsOneWidget);
      await _tap(tester, find.text('Alunos'));
      expect(
        find.byKey(const Key('center-coach-class-student-s2')),
        findsOneWidget,
      );
      expect(find.text('0 de 1 aulas'), findsOneWidget);
    });
  });
}
