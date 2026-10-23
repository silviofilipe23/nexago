import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/center_coach/application/center_coach_providers.dart';
import 'package:nexago_app/features/center_coach/domain/center_alerts.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/infrastructure/center_selection_store.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_agenda_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_alerts_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_call_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_class_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_today_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_checkin_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_student_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_students_page.dart';
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
  final cancels = <Map<String, Object?>>[];
  final checkins = <Map<String, Object?>>[];
  List<CenterCoachEnrollment> enrollments = const [];
  List<CenterCoachInvoice>? invoices;
  List<CenterAuditEntry> audit = const [];
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
  Stream<List<CenterCoachEnrollment>> watchEnrollments(String centerId) =>
      Stream.value(enrollments);

  @override
  Stream<List<CenterCoachInvoice>> watchInvoices(String centerId) =>
      Stream.value(invoices ?? const []);

  @override
  Stream<List<CenterAuditEntry>> watchAuditLogs(
    String centerId, {
    int limit = 100,
  }) => Stream.value(audit);

  @override
  Future<void> cancelSession({
    required String centerId,
    required CenterCoachSession session,
    required String reason,
    required List<String> creditStudentIds,
    required String actorUid,
    required String actorName,
  }) async {
    cancels.add({
      'session': session.id,
      'reason': reason,
      'credits': creditStudentIds,
    });
  }

  @override
  Future<CenterCheckinResult> checkIn({
    required String centerId,
    String? qr,
    String? studentId,
    bool force = false,
  }) async {
    checkins.add({'qr': qr, 'studentId': studentId, 'force': force});
    if (qr != null && !qr.startsWith('nexago-ct:c1:')) {
      return const CenterCheckinResult(state: 'wrong_center');
    }
    final id = studentId ?? 's1';
    final hold = id == 's3' && !force;
    return CenterCheckinResult(
      state: hold ? 'hold' : 'checked_in',
      studentId: id,
      studentName: id == 's3' ? 'Elisa Prado' : 'Marina Teles',
      sessionId: 'k1_b',
      className: 'BT Intermediário B',
      startTime: '19:00',
      billingHold: id == 's3',
    );
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
  String role = 'coach',
}) => CenterMembership.fromMap(centerId, {
  'centerName': name,
  'role': role,
  'status': status,
  'displayName': 'Thiago Mendes',
});

Future<GoRouter> _pump(
  WidgetTester tester,
  String location,
  _Fake fake, {
  String scanned = 'nexago-ct:c1:ABCDEFGH23',
  _MemoryCenterStore? store,
  List<Uri>? launched,
}) async {
  tester.view.physicalSize = const Size(420, 2000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(path: AppRoutes.home, builder: (_, __) => const Scaffold()),
      GoRoute(
        path: AppRoutes.centerHome,
        builder: (_, __) => const CenterCoachAgendaPage(modeHome: true),
      ),
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
        path: AppRoutes.centerCoachCheckin,
        name: AppRouteNames.centerCoachCheckin,
        builder: (_, s) =>
            CenterCoachCheckinPage(centerId: s.pathParameters['centerId']!),
      ),
      GoRoute(
        path: AppRoutes.centerCoachAlerts,
        name: AppRouteNames.centerCoachAlerts,
        builder: (_, s) =>
            CenterCoachAlertsPage(centerId: s.pathParameters['centerId']!),
      ),
      GoRoute(
        path: AppRoutes.centerCoachStudents,
        name: AppRouteNames.centerCoachStudents,
        builder: (_, s) =>
            CenterCoachStudentsPage(centerId: s.pathParameters['centerId']!),
      ),
      GoRoute(
        path: AppRoutes.centerCoachStudent,
        name: AppRouteNames.centerCoachStudent,
        builder: (_, s) => CenterCoachStudentPage(
          centerId: s.pathParameters['centerId']!,
          studentId: s.pathParameters['studentId']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.centerCoachToday,
        name: AppRouteNames.centerCoachToday,
        builder: (_, s) =>
            CenterCoachTodayPage(centerId: s.pathParameters['centerId']!),
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
        centerSelectionStoreProvider.overrideWithValue(
          store ?? _MemoryCenterStore(),
        ),
        centerCheckinScanLauncherProvider.overrideWithValue(
          (_) async => scanned,
        ),
        centerContactLauncherProvider.overrideWithValue((uri) async {
          launched?.add(uri);
          return true;
        }),
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

    testWidgets('modo Centro: sem voltar, com ajustes; reabre no centro salvo', (
      tester,
    ) async {
      final fake = _Fake(
        memberships: [
          _member('c1', 'CT Maré Alta'),
          _member('c2', 'Norte Beach'),
        ],
      );
      final store = _MemoryCenterStore({'tm': 'c2'});
      await _pump(tester, AppRoutes.centerHome, fake, store: store);
      expect(find.text('NORTE BEACH · PROFESSOR'), findsOneWidget);
      expect(find.bySemanticsLabel('Voltar'), findsNothing);

      await _tap(tester, find.byKey(const Key('center-coach-switch')));
      await _tap(tester, find.byKey(const Key('center-coach-option-c1')));
      expect(find.text('CT MARÉ ALTA · PROFESSOR'), findsOneWidget);
      expect(store.saved, {'tm': 'c1'});

      await _tap(tester, find.byKey(const Key('center-mode-settings')));
      expect(
        find.byKey(const Key('center-mode-settings-sheet')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('center-mode-settings-sign-out')),
        findsOneWidget,
      );
    });

    testWidgets('?centro= abre nele, mas a troca vence a rota', (tester) async {
      final fake = _Fake(
        memberships: [
          _member('c1', 'CT Maré Alta'),
          _member('c2', 'Norte Beach'),
        ],
      );
      await _pump(tester, '${AppRoutes.centerCoachAgenda}?centro=c2', fake);
      expect(find.text('NORTE BEACH · PROFESSOR'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-coach-switch')));
      await _tap(tester, find.byKey(const Key('center-coach-option-c1')));
      expect(find.text('CT MARÉ ALTA · PROFESSOR'), findsOneWidget);
    });

    testWidgets('centro salvo que deixou de ser ativo cai no primeiro', (
      tester,
    ) async {
      await _pump(
        tester,
        AppRoutes.centerHome,
        _Fake(
          memberships: [
            _member('c1', 'CT Maré Alta'),
            _member('c2', 'Norte Beach', status: 'revoked'),
          ],
        ),
        store: _MemoryCenterStore({'tm': 'c2'}),
      );
      expect(find.text('CT MARÉ ALTA · PROFESSOR'), findsOneWidget);
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

  group('G1/G4/G6 · gestão', () {
    _Fake staffFake() =>
        _Fake(
            memberships: [_member('c1', 'CT Maré Alta', role: 'center_owner')],
            students: _students,
            sessions: [
              _session(
                'k1_a',
                start: '07:00',
                extra: {
                  'attendance': {'s1': 'present'},
                },
              ),
              _session('k1_b'),
              _session('k2_b', start: '20:00', coachUid: 'paula'),
            ],
          )
          ..enrollments = const [
            CenterCoachEnrollment(
              id: 'e1',
              studentId: 's1',
              classId: 'k1',
              status: 'active',
            ),
            CenterCoachEnrollment(
              id: 'e2',
              studentId: 's2',
              classId: 'k1',
              status: 'paused',
            ),
            CenterCoachEnrollment(
              id: 'e3',
              studentId: 's9',
              classId: 'k1',
              status: 'waitlisted',
            ),
          ]
          ..invoices = [
            const CenterCoachInvoice(
              id: 'i1',
              status: 'pending',
              amountCents: 32000,
              dueDate: '2026-10-05',
            ),
            CenterCoachInvoice(
              id: 'i2',
              status: 'approved',
              amountCents: 48000,
              dueDate: '2026-10-05',
              approvedAt: DateTime.utc(2026, 10, 4, 15),
            ),
          ];

    testWidgets('agenda do centro inteiro com filtro por professor', (
      tester,
    ) async {
      await _pump(tester, AppRoutes.centerCoachAgenda, staffFake());
      expect(find.byKey(const Key('center-coach-today-entry')), findsOneWidget);
      expect(
        find.byKey(const Key('center-coach-row-k2_b')),
        findsOneWidget,
        reason: 'owner vê a aula da Paula',
      );
      await _tap(tester, find.byKey(const Key('center-coach-filter-mine')));
      expect(find.byKey(const Key('center-coach-row-k2_b')), findsNothing);
      await _tap(tester, find.byKey(const Key('center-coach-filter-paula')));
      expect(find.byKey(const Key('center-coach-row-k2_b')), findsOneWidget);
      expect(find.byKey(const Key('center-coach-row-k1_b')), findsNothing);
    });

    testWidgets(
      'hoje no centro: chamada pendente, fila, cobrança vencida e recebido',
      (tester) async {
        await _pump(tester, '/athlete/professor/centros/c1/hoje', staffFake());
        expect(find.text('Chamada não finalizada'), findsOneWidget);
        expect(find.text('1 na lista de espera'), findsOneWidget);
        expect(find.text('1 cobrança vencida'), findsOneWidget);
        expect(find.byKey(const Key('center-today-money')), findsOneWidget);
        expect(find.byKey(const Key('center-today-row-k1_b')), findsOneWidget);
      },
    );

    testWidgets('recepção não vê valores', (tester) async {
      final fake = staffFake()
        ..memberships = [_member('c1', 'CT Maré Alta', role: 'receptionist')];
      await _pump(tester, '/athlete/professor/centros/c1/hoje', fake);
      expect(find.byKey(const Key('center-today-money')), findsNothing);
      expect(find.text('1 cobrança vencida'), findsNothing);
    });

    testWidgets(
      'cancelar aula: motivo e reposição para quem estava treinando',
      (tester) async {
        final fake = staffFake();
        await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', fake);
        await _tap(tester, find.byKey(const Key('center-coach-cancel')));
        expect(
          find.byKey(const Key('center-coach-cancel-sheet')),
          findsOneWidget,
        );
        expect(find.text('+1 · validade 30 dias'), findsOneWidget);
        await _tap(
          tester,
          find.byKey(const Key('center-coach-cancel-confirm')),
        );
        expect(fake.cancels.single, {
          'session': 'k1_b',
          'reason': 'Chuva',
          'credits': ['s1'],
        });
      },
    );

    testWidgets('professor não vê o cancelar', (tester) async {
      final fake = staffFake()..memberships = [_member('c1', 'CT Maré Alta')];
      await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', fake);
      expect(find.byKey(const Key('center-coach-cancel')), findsNothing);
    });
  });

  group('G7/G8 · check-in', () {
    _Fake desk() => _Fake(
      memberships: [_member('c1', 'CT Maré Alta', role: 'receptionist')],
      students: _students,
      sessions: [_session('k1_b')],
    );

    testWidgets('carteirinha lida: presente e entra nas chegadas', (
      tester,
    ) async {
      final fake = desk();
      await _pump(tester, '/athlete/professor/centros/c1/checkin', fake);
      await _tap(tester, find.byKey(const Key('center-checkin-scan')));
      expect(fake.checkins.single['qr'], 'nexago-ct:c1:ABCDEFGH23');
      expect(find.text('Marina Teles · presente'), findsOneWidget);
      expect(find.text('ÚLTIMAS CHEGADAS'), findsOneWidget);
    });

    testWidgets('busca por nome, pendência e registrar mesmo assim', (
      tester,
    ) async {
      final fake = desk();
      await _pump(tester, '/athlete/professor/centros/c1/checkin', fake);
      await tester.enterText(
        find.byKey(const Key('center-checkin-search')),
        'eli',
      );
      await _settle(tester);
      await _tap(tester, find.byKey(const Key('center-checkin-student-s3')));
      expect(find.text('Elisa Prado · mensalidade em atraso'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-checkin-force')));
      expect(fake.checkins.last, {
        'qr': null,
        'studentId': 's3',
        'force': true,
      });
      expect(find.text('Elisa Prado · presente'), findsOneWidget);
    });

    testWidgets('carteirinha de outro centro', (tester) async {
      await _pump(
        tester,
        '/athlete/professor/centros/c1/checkin',
        desk(),
        scanned: 'nexago-ct:c9:X',
      );
      await _tap(tester, find.byKey(const Key('center-checkin-scan')));
      expect(find.text('Carteirinha de outro centro'), findsOneWidget);
    });

    testWidgets('recepção chega ao check-in pela agenda', (tester) async {
      final router = await _pump(tester, AppRoutes.centerCoachAgenda, desk());
      await _tap(tester, find.byKey(const Key('center-coach-checkin-entry')));
      expect(router.state.uri.path, '/athlete/professor/centros/c1/checkin');
    });
  });

  group('G9/G10 · alunos', () {
    _Fake school({String role = 'center_owner'}) {
      final fake = _Fake(
        memberships: [_member('c1', 'CT Maré Alta', role: role)],
        students: [
          CenterCoachStudent.fromMap('s1', {
            'name': 'Marina Teles',
            'phone': '(21) 99876-5432',
            'email': 'marina@x.com',
            'uid': 'ana',
          }),
          const CenterCoachStudent(
              id: 's2', name: 'Caio Ramos', makeupCredits: 2),
          CenterCoachStudent.fromMap('s3', {
            'name': 'Elisa Prado',
            'isMinor': true,
            'billingHold': true,
            'phone': '21 90000-0000',
            'guardian': {
              'name': 'Rita Prado',
              'relation': 'mãe',
              'phone': '(21) 98888-7777'
            },
          }),
          const CenterCoachStudent(
              id: 's9', name: 'Ex Aluno', status: 'inactive'),
        ],
        sessions: [
          _session('k1_a', date: '2026-10-20', status: 'done', extra: {
            'attendance': {'s1': 'present', 's3': 'absent'},
          }),
          _session('k1_c', date: '2026-10-22', status: 'done', extra: {
            'attendance': {'s1': 'excused'},
          }),
        ],
      );
      fake.enrollments = [
        CenterCoachEnrollment.fromMap('e1', {
          'studentId': 's1',
          'classId': 'k1',
          'className': 'BT Intermediário B',
          'status': 'active',
          'startDate': '2026-09-01',
          'contract': {
            'planName': 'Mensal 2x',
            'planType': 'monthly',
            'priceCents': 32000
          },
        }),
        CenterCoachEnrollment.fromMap('e0', {
          'studentId': 's1',
          'classId': 'k0',
          'className': 'BT Iniciante',
          'status': 'completed',
        }),
      ];
      fake.invoices = [
        const CenterCoachInvoice(
          id: 'i1',
          status: 'pending',
          amountCents: 32000,
          dueDate: '2026-10-10',
          studentId: 's1',
          reference: 'Mensalidade outubro',
        ),
      ];
      return fake;
    }

    testWidgets('lista, busca sem acento e filtros', (tester) async {
      await _pump(tester, '/athlete/professor/centros/c1/alunos', school());
      expect(find.text('3 ATIVOS'), findsOneWidget);
      expect(find.byKey(const Key('center-students-row-s9')), findsNothing);
      expect(find.text('ATRASADO'), findsOneWidget, reason: 's1 venceu 10/10');
      await tester.enterText(
          find.byKey(const Key('center-students-search')), 'elisa');
      await _settle(tester);
      expect(find.byKey(const Key('center-students-row-s3')), findsOneWidget);
      expect(find.byKey(const Key('center-students-row-s1')), findsNothing);
      await tester.enterText(
          find.byKey(const Key('center-students-search')), '');
      await _tap(
          tester, find.byKey(const Key('center-students-filter-credits')));
      expect(find.byKey(const Key('center-students-row-s2')), findsOneWidget);
      expect(find.byKey(const Key('center-students-row-s1')), findsNothing);
      await _tap(
          tester, find.byKey(const Key('center-students-filter-pending')));
      expect(find.byKey(const Key('center-students-row-s1')), findsOneWidget);
      expect(find.byKey(const Key('center-students-row-s3')), findsOneWidget);
      expect(find.byKey(const Key('center-students-row-s2')), findsNothing);
    });

    testWidgets('perfil: matrícula, cobrança, presença e contato',
        (tester) async {
      final launched = <Uri>[];
      final router = await _pump(
        tester,
        '/athlete/professor/centros/c1/alunos',
        school(),
        launched: launched,
      );
      await _tap(tester, find.byKey(const Key('center-students-row-s1')));
      expect(router.state.uri.path, '/athlete/professor/centros/c1/alunos/s1');
      expect(find.byKey(const Key('center-student-enrollment-e1')),
          findsOneWidget);
      expect(find.textContaining('320,00/mês'), findsOneWidget);
      expect(find.text('Mensalidade outubro'), findsOneWidget);
      expect(find.text('50% · 1 de 2'), findsOneWidget);
      expect(find.text('BT Iniciante'), findsOneWidget,
          reason: 'matrícula antiga');
      await _tap(
          tester, find.byKey(const Key('center-student-contact-whatsapp')));
      expect(launched.single.toString(), 'https://wa.me/5521998765432');
    });

    testWidgets('menor: contato é o do responsável; recepção sem valores',
        (tester) async {
      final launched = <Uri>[];
      await _pump(
        tester,
        '/athlete/professor/centros/c1/alunos/s3',
        school(role: 'receptionist'),
        launched: launched,
      );
      expect(
          find.textContaining('Responsável: Rita Prado (mãe)'), findsOneWidget);
      expect(
          find.byKey(const Key('center-student-contact-email')), findsNothing);
      await _tap(tester, find.byKey(const Key('center-student-contact-call')));
      expect(launched.single.toString(), 'tel:21988887777');
      expect(find.textContaining('Mensalidade em atraso'), findsOneWidget);
      expect(find.text('COBRANÇAS'), findsNothing);
    });

    testWidgets('professor vê as turmas dele e chega pela agenda',
        (tester) async {
      final fake = school(role: 'coach');
      final router = await _pump(tester, AppRoutes.centerCoachAgenda, fake);
      expect(find.text('Meus alunos no centro'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-coach-students-entry')));
      expect(router.state.uri.path, '/athlete/professor/centros/c1/alunos');
      expect(find.text('Meus alunos'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-students-row-s2')));
      expect(
          find.byKey(const Key('center-student-enrollment-e1')), findsNothing);
      expect(find.text('2 disponíveis'), findsOneWidget);
      expect(find.text('COBRANÇAS'), findsNothing);
    });
  });

  group('G3/G5 · alertas e detalhe da aula', () {
    _Fake owner({String role = 'center_owner'}) =>
        _Fake(
            memberships: [_member('c1', 'CT Maré Alta', role: role)],
            students: _students,
            sessions: [
              _session('k1_b', extra: {'makeupStudentIds': ['m1']}),
            ],
          )
          ..audit = [
            CenterAuditEntry(
              id: 'a1',
              action: 'session.cancelled',
              at: DateTime.utc(2026, 10, 23, 14),
              actorName: 'Thiago',
              entity: 'session',
              entityId: 'k1_b',
              detail: 'BT Intermediário B · 23/10 19:00',
              reason: 'Chuva',
            ),
            CenterAuditEntry(
              id: 'a2',
              action: 'invoice.manual_confirm',
              at: DateTime.utc(2026, 10, 22, 13),
              actorName: 'Camila',
              detail: 'Carla Dias · R\$ 320,00',
            ),
          ];

    testWidgets('alertas por dia, filtro e toque abre a aula', (tester) async {
      final router = await _pump(
        tester,
        '/athlete/professor/centros/c1/alertas',
        owner(),
      );
      expect(find.text('HOJE'), findsOneWidget);
      expect(find.text('ONTEM'), findsOneWidget);
      expect(find.text('Aula cancelada'), findsOneWidget);
      expect(find.text('Motivo: Chuva · por Thiago'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-alerts-filter-finance')));
      expect(find.text('Aula cancelada'), findsNothing);
      expect(find.text('Pagamento confirmado à mão'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-alerts-filter-all')));
      await _tap(tester, find.byKey(const Key('center-alert-a1')));
      expect(router.state.uri.path, '/athlete/professor/centros/c1/aula/k1_b');
    });

    testWidgets('só owner/admin: recepção sem alertas e sem o atalho', (
      tester,
    ) async {
      await _pump(
        tester,
        '/athlete/professor/centros/c1/hoje',
        owner(role: 'receptionist'),
      );
      expect(find.byKey(const Key('center-today-alerts')), findsNothing);
      await _pump(
        tester,
        '/athlete/professor/centros/c1/alertas',
        owner(role: 'receptionist'),
      );
      expect(find.byKey(const Key('center-alerts-denied')), findsOneWidget);
    });

    testWidgets('owner chega aos alertas pelo Hoje', (tester) async {
      final router = await _pump(
        tester,
        '/athlete/professor/centros/c1/hoje',
        owner(),
      );
      await _tap(tester, find.byKey(const Key('center-today-alerts')));
      expect(router.state.uri.path, '/athlete/professor/centros/c1/alertas');
    });

    testWidgets('detalhe da aula: professor, matriculados, reposição e vagas', (
      tester,
    ) async {
      await _pump(tester, '/athlete/professor/centros/c1/aula/k1_b', owner());
      expect(find.byKey(const Key('center-coach-class-info')), findsOneWidget);
      expect(find.text('3/6'), findsOneWidget);
      expect(find.text('+1'), findsOneWidget);
      expect(find.text('2'), findsWidgets);
      expect(find.text('vagas livres'), findsOneWidget);
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_b',
        owner(role: 'coach'),
      );
      expect(find.byKey(const Key('center-coach-class-info')), findsNothing);
    });
  });
}

class _MemoryCenterStore implements CenterSelectionStore {
  _MemoryCenterStore([Map<String, String>? initial])
      : saved = {...?initial};

  final Map<String, String> saved;

  @override
  Future<String?> load(String uid) async => saved[uid];

  @override
  Future<void> save(String uid, String centerId) async => saved[uid] = centerId;
}
