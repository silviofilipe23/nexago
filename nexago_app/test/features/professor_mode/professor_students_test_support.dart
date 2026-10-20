import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_students.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_students_repository.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_wallet_repository.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_classes_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_student_page.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_students_page.dart';

import 'professor_wallet_test_support.dart';

/// Apoio dos testes de Alunos/Aluno/Turmas do modo Professor: payload
/// realista da callable `getMyProfessorStudents`, o dublê do repositório e o
/// app mínimo com as rotas reais.

const professorStudentsTestUid = 'prof-1';

/// Terça, 20/10/2026.
const professorStudentsTodayKey = '2026-10-20';

Map<String, Object?> arenaMap({
  String arenaId = 'arena-cfc',
  String arenaName = 'Arena CFC',
  String? type = 'ARENA_STAFF',
  bool canSeeStudents = true,
  int studentCount = 2,
  int classCount = 2,
}) =>
    {
      'arenaId': arenaId,
      'arenaName': arenaName,
      'relationshipType': type,
      'canSeeStudents': canSeeStudents,
      'studentCount': studentCount,
      'classCount': classCount,
    };

Map<String, Object?> classMap(Map<String, Object?> over) => {
      'classId': 'c1',
      'arenaId': 'arena-cfc',
      'arenaName': 'Arena CFC',
      'name': 'Iniciante A',
      'type': 'turma',
      'level': 'iniciante',
      'weekdays': [2, 4],
      'startTime': '19:00',
      'endTime': '20:00',
      'courtName': 'Quadra 2',
      'capacity': 6,
      'activeCount': 4,
      'waitlistCount': 0,
      'presenceRate': 88,
      'nextDate': '2026-10-22',
      'status': 'active',
      ...over,
    };

Map<String, Object?> studentClassMap({
  String classId = 'c1',
  String name = 'Iniciante A',
  String type = 'turma',
  List<int> weekdays = const [2, 4],
  String startTime = '19:00',
}) =>
    {
      'classId': classId,
      'name': name,
      'type': type,
      'weekdays': weekdays,
      'startTime': startTime,
      'endTime': '20:00',
    };

Map<String, Object?> studentMap(Map<String, Object?> over) => {
      'studentId': 's1',
      'arenaId': 'arena-cfc',
      'arenaName': 'Arena CFC',
      'athleteId': 'ath-1',
      'name': 'João Silva',
      'photoUrl': null,
      'status': 'active',
      'since': '2025-03-10',
      'classes': [studentClassMap()],
      'marks': [
        {'date': '2026-10-13', 'mark': 'present'},
        {'date': '2026-10-15', 'mark': 'absent'},
        {'date': '2026-10-16', 'mark': 'present', 'makeup': true},
      ],
      'presenceRate': 95,
      'lastDate': '2026-10-16',
      'credits': 1,
      'plans': [
        {
          'enrollmentId': 'e1',
          'status': 'active',
          'name': '2x por semana',
          'kind': 'monthly',
          'priceReais': 280,
        },
      ],
      'billing': {'standing': 'up_to_date', 'nextDueDate': '2026-11-05'},
      ...over,
    };

/// Duas arenas com alunos (CFC da equipe, Norte independente) e uma sem
/// acesso (Lagoa). João em dia, Maria atrasada, Pedro particular na Norte
/// (sem cobrança: independente).
Map<String, Object?> professorStudentsPayload({
  List<Map<String, Object?>>? arenas,
  List<Map<String, Object?>>? classes,
  List<Map<String, Object?>>? students,
}) =>
    {
      'todayKey': professorStudentsTodayKey,
      'arenas': arenas ??
          [
            arenaMap(),
            arenaMap(
              arenaId: 'arena-norte',
              arenaName: 'Arena Norte',
              type: 'INDEPENDENT',
              studentCount: 1,
              classCount: 1,
            ),
          ],
      'classes': classes ??
          [
            classMap({}),
            classMap({
              'classId': 'c2',
              'arenaId': 'arena-norte',
              'arenaName': 'Arena Norte',
              'name': 'Particular Pedro',
              'type': 'particular',
              'level': 'avancado',
            }),
          ],
      'students': students ??
          [
            studentMap({}),
            studentMap({
              'studentId': 's2',
              'name': 'Maria Souza',
              'presenceRate': 70,
              'credits': 0,
              'billing': {'standing': 'overdue', 'nextDueDate': '2026-10-05'},
            }),
            studentMap({
              'studentId': 's3',
              'arenaId': 'arena-norte',
              'arenaName': 'Arena Norte',
              'name': 'Pedro Lima',
              'classes': [
                studentClassMap(
                  classId: 'c2',
                  name: 'Particular Pedro',
                  type: 'particular',
                ),
              ],
              'presenceRate': null,
              'marks': <Object?>[],
              'plans': <Object?>[],
              'billing': null,
              'credits': 0,
            }),
          ],
    };

ProfessorStudentsSnapshot professorStudentsSnapshot({
  List<Map<String, Object?>>? arenas,
  List<Map<String, Object?>>? classes,
  List<Map<String, Object?>>? students,
}) =>
    ProfessorStudentsSnapshot.fromMap(
      professorStudentsPayload(
        arenas: arenas,
        classes: classes,
        students: students,
      ),
    );

typedef SaveNoteCall = ({
  String uid,
  String arenaId,
  String studentId,
  String text,
});

/// Repositório em memória. [responses] é consumido em ordem a cada
/// `fetchMyStudents` (o último se repete); um `Object` que não é snapshot é
/// lançado.
class FakeProfessorStudentsRepository implements ProfessorStudentsRepository {
  FakeProfessorStudentsRepository(List<Object> responses)
      : _responses = List.of(responses);

  final List<Object> _responses;
  int fetchCount = 0;
  Object? saveError;
  final saveCalls = <SaveNoteCall>[];
  final notes = <String, String>{};
  final _noteChanges = StreamController<void>.broadcast();

  @override
  Future<ProfessorStudentsSnapshot> fetchMyStudents() async {
    final r = _responses.length > fetchCount
        ? _responses[fetchCount]
        : _responses.last;
    fetchCount++;
    if (r is ProfessorStudentsSnapshot) return r;
    throw r;
  }

  @override
  Stream<String> watchNote({
    required String uid,
    required String arenaId,
    required String studentId,
  }) async* {
    final id = professorNoteId(arenaId, studentId);
    yield notes[id] ?? '';
    await for (final _ in _noteChanges.stream) {
      yield notes[id] ?? '';
    }
  }

  @override
  Future<void> saveNote({
    required String uid,
    required String arenaId,
    required String studentId,
    required String text,
  }) async {
    saveCalls.add(
      (uid: uid, arenaId: arenaId, studentId: studentId, text: text),
    );
    final error = saveError;
    if (error != null) throw error;
    notes[professorNoteId(arenaId, studentId)] = text.trim();
    _noteChanges.add(null);
  }
}

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

/// App mínimo com as rotas reais de Alunos, Aluno e Turmas (a carteira
/// própria vem de [walletRepo], vazia por padrão).
Future<GoRouter> pumpProfessorStudentsApp(
  WidgetTester tester, {
  required FakeProfessorStudentsRepository repo,
  required String location,

  /// Carteira própria (fase 3); sem ela, vazia.
  ProfessorWalletRepository? walletRepo,
  String uid = professorStudentsTestUid,
  List<Override> overrides = const [],
  List<RouteBase> extraRoutes = const [],
  Size size = const Size(390, 1600),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.professorStudents,
        name: AppRouteNames.professorStudents,
        builder: (_, __) => const ProfessorStudentsPage(),
      ),
      GoRoute(
        path: AppRoutes.professorStudent,
        name: AppRouteNames.professorStudent,
        builder: (_, state) => ProfessorStudentPage(
          arenaId: state.pathParameters['arenaId'] ?? '',
          studentId: state.pathParameters['studentId'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.professorClasses,
        name: AppRouteNames.professorClasses,
        builder: (_, __) => const ProfessorClassesPage(),
      ),
      GoRoute(
        path: AppRoutes.professorArenas,
        name: AppRouteNames.professorArenas,
        builder: (_, __) => _stub('minhas arenas'),
      ),
      ...extraRoutes,
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorStudentsRepositoryProvider.overrideWithValue(repo),
        professorWalletRepositoryProvider
            .overrideWithValue(walletRepo ?? FakeProfessorWalletRepository()),
        professorLinksUidProvider.overrideWithValue(uid),
        ...overrides,
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await settleProfessorStudents(tester);
  return router;
}

/// Sem `pumpAndSettle`: os indicadores de carregamento giram para sempre.
Future<void> settleProfessorStudents(
  WidgetTester tester, [
  int frames = 12,
]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}
