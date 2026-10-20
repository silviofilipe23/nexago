import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_actions.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_actions_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_add_student_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_convert_trial_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_enroll_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_makeup_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_new_lesson_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_notice_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/actions/professor_waitlist_page.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students.dart';

import 'professor_students_test_support.dart';

/// Apoio dos testes da fase 2 (ações do professor): payload realista de
/// `getProfessorClassActions`, o dublê do repositório e as rotas reais.
///
/// Hoje = ter 20/10/2026. c1 Iniciante A (ter/qui, 6 vagas: 5 na ter, 6 na
/// qui → lotada), c3 Iniciante Sábado (seg/qua, 4 vagas, vazia).
Map<String, Object?> professorActionsPayload({
  Map<String, Object?>? permissions,
  bool onlineBilling = false,
}) =>
    {
      'todayKey': professorStudentsTodayKey,
      'arenaId': 'arena-cfc',
      'permissions': permissions ??
          {
            'canEnrollStudents': true,
            'canScheduleLessons': true,
            'canCancelLessons': true,
          },
      'rules': {
        'onlineBillingEnabled': onlineBilling,
        'makeupValidityDays': 30,
        'arenaCancelGeneratesCredit': true,
        'enrollmentFeeReais': 0,
      },
      'plans': [
        {
          'planId': 'p1',
          'name': '1x por semana',
          'kind': 'monthly',
          'priceReais': 180,
          'classesPerWeek': 1
        },
        {
          'planId': 'p2',
          'name': '2x por semana',
          'kind': 'monthly',
          'priceReais': 320,
          'classesPerWeek': 2
        },
        {
          'planId': 'p4',
          'name': 'Pacote 4 aulas',
          'kind': 'package',
          'priceReais': 440,
          'credits': 4
        },
      ],
      'classes': [
        {
          'classId': 'c1',
          'name': 'Iniciante A',
          'type': 'turma',
          'level': 'iniciante',
          'sport': 'beachTennis',
          'weekdays': [2, 4],
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2',
          'capacity': 6,
          'takenByWeekday': {'2': 5, '4': 6},
        },
        {
          'classId': 'c3',
          'name': 'Iniciante Sábado',
          'type': 'turma',
          'level': 'iniciante',
          'sport': 'beachTennis',
          'weekdays': [1, 3],
          'startTime': '08:00',
          'endTime': '09:00',
          'courtName': 'Quadra 1',
          'capacity': 4,
          'takenByWeekday': {'1': 0, '3': 0},
        },
      ],
      'sessions': [
        {
          'sessionId': 's-c1a',
          'classId': 'c1',
          'className': 'Iniciante A',
          'type': 'turma',
          'date': '2026-10-20',
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2',
          'capacity': 6,
          'taken': 6,
          'studentCount': 5,
          'extras': [
            {
              'studentId': 't1',
              'name': 'Rafa Torres',
              'kind': 'trial',
              'athleteId': 'ath-rafa'
            },
          ],
        },
        {
          'sessionId': 's-c1b',
          'classId': 'c1',
          'className': 'Iniciante A',
          'type': 'turma',
          'date': '2026-10-21',
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2',
          'capacity': 6,
          'taken': 3,
          'studentCount': 3,
          'extras': <Object?>[],
        },
        {
          'sessionId': 's-c3',
          'classId': 'c3',
          'className': 'Iniciante Sábado',
          'type': 'turma',
          'date': '2026-10-26',
          'startTime': '08:00',
          'endTime': '09:00',
          'courtName': 'Quadra 1',
          'capacity': 4,
          'taken': 0,
          'studentCount': 0,
          'extras': <Object?>[],
        },
      ],
      'waitlist': [
        {
          'entryId': 'w1',
          'classId': 'c1',
          'name': 'Ana Lima',
          'athleteId': 'ath-ana',
          'note': 'Já é aluna particular',
          'since': '2026-10-02'
        },
        {
          'entryId': 'w2',
          'classId': 'c1',
          'name': 'Pedro Costa',
          'athleteId': null,
          'note': null,
          'since': '2026-10-09'
        },
      ],
      'credits': [
        {
          'creditId': 'k1',
          'studentId': 's1',
          'name': 'João Silva',
          'expiresOn': '2026-11-19',
          'sourceDate': '2026-10-15'
        },
      ],
      'trials': [
        {
          'sessionId': 's-c1a',
          'classId': 'c1',
          'className': 'Iniciante A',
          'date': '2026-10-20',
          'startTime': '19:00',
          'studentId': 't1',
          'athleteId': 'ath-rafa',
          'name': 'Rafa Torres',
          'mark': 'present',
        },
      ],
    };

/// Repositório em memória: grava as chamadas; [error] faz a próxima falhar.
class FakeProfessorActionsRepository implements ProfessorActionsRepository {
  FakeProfessorActionsRepository([Map<String, Object?>? payload])
      : payload = payload ?? professorActionsPayload();

  Map<String, Object?> payload;
  Object? error;
  final calls = <String>[];
  ProfessorEnrollmentRequest? lastEnrollment;
  final cancels =
      <({String sessionId, String reason, bool credits, String? message})>[];
  ({List<String> sessionIds, String message})? lastNotice;
  ({
    String type,
    String date,
    String start,
    String end,
    List<ProfessorActionStudent> students
  })? lastLesson;

  Future<void> _maybeFail() async {
    final e = error;
    if (e != null) {
      error = null;
      throw e;
    }
  }

  @override
  Future<ProfessorActionsContext> fetchContext(String arenaId) async {
    calls.add('fetchContext:$arenaId');
    return ProfessorActionsContext.fromMap(payload);
  }

  @override
  Future<ProfessorEnrollmentPreview> previewEnrollment(
      ProfessorEnrollmentRequest request) async {
    calls.add('preview:${request.planId}');
    return const ProfessorEnrollmentPreview(
      charges: [
        (
          description: 'Mensalidade · out/2026',
          amount: 120,
          dueDate: '2026-10-20'
        )
      ],
      total: 120,
    );
  }

  @override
  Future<String> enroll(ProfessorEnrollmentRequest request) async {
    await _maybeFail();
    lastEnrollment = request;
    calls.add('enroll');
    return 'e-new';
  }

  @override
  Future<void> addTrial(
      {required String sessionId,
      required ProfessorActionStudent student}) async {
    await _maybeFail();
    calls.add('trial:$sessionId:${student.athleteId}');
  }

  @override
  Future<void> addMakeup(
      {required String sessionId, required String creditId}) async {
    await _maybeFail();
    calls.add('makeup:$sessionId:$creditId');
  }

  @override
  Future<void> addToWaitlist(
      {required String classId,
      required ProfessorActionStudent student,
      String? note}) async {
    await _maybeFail();
    calls.add('waitlist:$classId:${student.athleteId}');
  }

  @override
  Future<void> removeFromWaitlist(
      {required String classId, required String entryId}) async {
    await _maybeFail();
    calls.add('unwait:$classId:$entryId');
  }

  @override
  Future<void> moveStudent(
      {required String fromClassId,
      required String toClassId,
      required String studentId}) async {
    await _maybeFail();
    calls.add('move:$fromClassId>$toClassId:$studentId');
  }

  @override
  Future<String> createLesson({
    required String arenaId,
    required String type,
    required String date,
    required String startTime,
    required String endTime,
    required List<ProfessorActionStudent> students,
    String? sport,
  }) async {
    await _maybeFail();
    lastLesson = (
      type: type,
      date: date,
      start: startTime,
      end: endTime,
      students: students
    );
    calls.add('lesson');
    return 'Quadra 3';
  }

  @override
  Future<int> sendNotice(
      {required List<String> sessionIds, required String message}) async {
    await _maybeFail();
    lastNotice = (sessionIds: sessionIds, message: message);
    calls.add('notice');
    return 7;
  }

  @override
  Future<void> cancelSession({
    required String sessionId,
    required String reason,
    required bool generateCredits,
    String? message,
  }) async {
    await _maybeFail();
    cancels.add((
      sessionId: sessionId,
      reason: reason,
      credits: generateCredits,
      message: message
    ));
  }
}

String? _q(GoRouterState s, String k) {
  final v = s.uri.queryParameters[k];
  return v == null || v.isEmpty ? null : v;
}

/// Rotas reais das telas de ação (as do app de produção, mesmos nomes).
final List<RouteBase> professorActionRoutes = [
  GoRoute(
    path: AppRoutes.professorAddStudent,
    name: AppRouteNames.professorAddStudent,
    builder: (_, s) => ProfessorAddStudentPage(arenaId: _q(s, 'arenaId')),
  ),
  GoRoute(
    path: AppRoutes.professorEnroll,
    name: AppRouteNames.professorEnroll,
    builder: (_, s) => ProfessorEnrollPage(
      arenaId: s.pathParameters['arenaId']!,
      studentName: _q(s, 'name') ?? 'Aluno',
      athleteId: _q(s, 'athleteId'),
      studentId: _q(s, 'studentId'),
      classId: _q(s, 'classId'),
      waitlistEntryId: _q(s, 'entryId'),
    ),
  ),
  GoRoute(
    path: AppRoutes.professorConvertTrial,
    name: AppRouteNames.professorConvertTrial,
    builder: (_, s) => ProfessorConvertTrialPage(
      arenaId: s.pathParameters['arenaId']!,
      athleteId: _q(s, 'athleteId') ?? '',
      name: _q(s, 'name') ?? 'Aluno',
      classId: _q(s, 'classId'),
      date: _q(s, 'date'),
    ),
  ),
  GoRoute(
    path: AppRoutes.professorNewLesson,
    name: AppRouteNames.professorNewLesson,
    builder: (_, s) => ProfessorNewLessonPage(
      arenaId: s.pathParameters['arenaId']!,
      studentId: _q(s, 'studentId'),
    ),
  ),
  GoRoute(
    path: AppRoutes.professorMakeup,
    name: AppRouteNames.professorMakeup,
    builder: (_, s) => ProfessorMakeupPage(
      arenaId: s.pathParameters['arenaId']!,
      studentId: s.pathParameters['studentId']!,
    ),
  ),
  GoRoute(
    path: AppRoutes.professorWaitlist,
    name: AppRouteNames.professorWaitlist,
    builder: (_, s) => ProfessorWaitlistPage(
      arenaId: s.pathParameters['arenaId']!,
      classId: s.pathParameters['classId']!,
    ),
  ),
  GoRoute(
    path: AppRoutes.professorNotice,
    name: AppRouteNames.professorNotice,
    builder: (_, s) =>
        ProfessorNoticePage(arenaId: s.pathParameters['arenaId']!),
  ),
];

/// Snapshot de alunos com a CFC liberando as três ações.
ProfessorStudentsSnapshot professorSnapshotWithActions({
  Map<String, Object?> actions = const {
    'canEnrollStudents': true,
    'canScheduleLessons': true,
    'canCancelLessons': true,
  },
  List<Map<String, Object?>>? students,
}) =>
    professorStudentsSnapshot(
      arenas: [
        {...arenaMap(), 'actions': actions},
        arenaMap(
            arenaId: 'arena-norte',
            arenaName: 'Arena Norte',
            type: 'INDEPENDENT'),
      ],
      students: students,
    );

/// Abre o app numa tela de ação, com os dois dublês.
Future<GoRouter> pumpProfessorActionsApp(
  WidgetTester tester, {
  required String location,
  required FakeProfessorActionsRepository actions,
  ProfessorStudentsSnapshot? snapshot,
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: FakeProfessorStudentsRepository(
          [snapshot ?? professorSnapshotWithActions()]),
      location: location,
      overrides: [
        professorActionsRepositoryProvider.overrideWithValue(actions)
      ],
      extraRoutes: professorActionRoutes,
    );
