import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';
import 'package:nexago_app/features/athlete/data/class_agenda_repository.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete/domain/agenda/teacher_class_roster.dart';
import 'package:nexago_app/features/athlete/presentation/teacher_class_attendance_page.dart';

/// Chamada do professor (vínculo com "Gerenciar as próprias aulas", PR #798):
/// `getMyClassAgenda` diz se pode (`canManageLessons`), a lista vem de
/// `getMyClassSessionRoster` e a gravação é a `saveArenaClassAttendance`. A
/// entrada ("Fazer chamada") fica na home do modo Professor.

Map<String, Object?> _entryMap(Map<String, Object?> over) => {
      'sessionId': 'class_c1_2026-10-20',
      'arenaId': 'arena1',
      'arenaName': 'Arena CFC',
      'classId': 'c1',
      'className': 'Intermediário B',
      'teacherName': 'Carla Dias',
      'courtName': 'Quadra 2',
      'date': '2026-10-20',
      'startTime': '19:00',
      'endTime': '20:00',
      'status': 'scheduled',
      'role': 'teacher',
      'kind': 'regular',
      'studentCount': 3,
      'canManageLessons': true,
      ...over,
    };

Map<String, Object?> _rosterMap({
  String date = '2026-10-20',
  String status = 'scheduled',
  bool attendanceOpen = true,
  List<Map<String, Object?>>? students,
}) =>
    {
      'session': {
        'sessionId': 'class_c1_2026-10-20',
        'arenaId': 'arena1',
        'arenaName': 'Arena CFC',
        'classId': 'c1',
        'className': 'Intermediário B',
        'date': date,
        'startTime': '19:00',
        'endTime': '20:00',
        'courtName': 'Quadra 2',
        'status': status,
        'teacherNote': null,
        'attendanceOpen': attendanceOpen,
      },
      'students': students ??
          [
            {
              'studentId': 's1',
              'name': 'Ana Lima',
              'photoUrl': null,
              'kind': 'regular',
              'mark': null,
            },
            {
              'studentId': 's2',
              'name': 'Bruno Reis',
              'photoUrl': null,
              'kind': 'regular',
              'mark': 'absent',
            },
            {
              'studentId': 'x1',
              'name': 'Caio Prado',
              'photoUrl': null,
              'kind': 'trial',
              'mark': null,
            },
          ],
    };

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('agenda: permissão', () {
    test('canManageLessons chega ao item; servidor antigo = false', () {
      expect(
        ClassAgendaEntry.fromMap(_entryMap({})).canManageLessons,
        isTrue,
      );
      expect(
        ClassAgendaEntry.fromMap(_entryMap({'canManageLessons': null}))
            .canManageLessons,
        isFalse,
      );
    });
    // O botão "Fazer chamada" mora no modo Professor:
    // test/features/professor_mode/.
  });

  group('lista da chamada', () {
    test('fromMap: sessão, alunos, tipo e marca', () {
      final roster = TeacherClassRoster.fromMap(_rosterMap());
      expect(roster.session.className, 'Intermediário B');
      expect(roster.session.attendanceOpen, isTrue);
      expect(roster.students.map((s) => s.studentId), ['s1', 's2', 'x1']);
      expect(roster.students.last.kind, 'trial');
      expect(roster.savedMarks, {'s2': AttendanceMark.absent});
    });

    test('repositório: pede a lista e grava pela mesma callable da equipe',
        () async {
      final functions = _FakeFunctions(
        responses: {
          'getMyClassSessionRoster': _rosterMap(),
          'saveArenaClassAttendance': {'status': 'completed', 'marked': 3},
        },
      );
      final repo = ClassAgendaRepository(functions: functions);

      final roster = await repo.fetchTeacherRoster('class_c1_2026-10-20');
      expect(roster.students, hasLength(3));
      expect(functions.calls.first.$1, 'getMyClassSessionRoster');
      expect(functions.calls.first.$2, {'sessionId': 'class_c1_2026-10-20'});

      await repo.saveTeacherAttendance(
        sessionId: 'class_c1_2026-10-20',
        marks: {'s1': 'present', 's2': null},
        close: true,
      );
      expect(functions.calls.last.$1, 'saveArenaClassAttendance');
      expect(functions.calls.last.$2, {
        'sessionId': 'class_c1_2026-10-20',
        'marks': {'s1': 'present', 's2': null},
        'close': true,
      });
    });

    test('repositório: recusa vira a mensagem do servidor', () async {
      final functions = _FakeFunctions(
        errors: {
          'getMyClassSessionRoster': FirebaseFunctionsException(
            code: 'permission-denied',
            message: 'A Arena CFC não liberou fazer a chamada das suas aulas '
                'no seu vínculo.',
            details: {'reason': 'permission_off'},
          ),
        },
      );
      final repo = ClassAgendaRepository(functions: functions);

      await expectLater(
        repo.fetchTeacherRoster('class_c1_2026-10-20'),
        throwsA(
          isA<TeacherClassException>().having(
            (e) => e.message,
            'message',
            contains('não liberou fazer a chamada'),
          ),
        ),
      );
    });
  });

  group('tela da chamada', () {
    Future<_FakeClassAgendaRepository> pumpPage(
      WidgetTester tester, {
      Map<String, Object?>? roster,
      Object? rosterError,
    }) async {
      tester.view.physicalSize = const Size(390, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final repo = _FakeClassAgendaRepository(
        roster: roster ?? _rosterMap(),
        rosterError: rosterError,
      );
      final router = GoRouter(
        initialLocation: '/athlete/professor/aulas/class_c1_2026-10-20',
        routes: [
          GoRoute(
            path: AppRoutes.discover,
            builder: (_, state) => Scaffold(body: Text('agenda ${state.uri}')),
          ),
          GoRoute(
            path: AppRoutes.professorClassAttendance,
            name: AppRouteNames.professorClassAttendance,
            builder: (_, state) => TeacherClassAttendancePage(
              sessionId: state.pathParameters['sessionId'] ?? '',
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [classAgendaRepositoryProvider.overrideWithValue(repo)],
          child: MaterialApp.router(
            theme: AppTheme.dark,
            routerConfig: router,
          ),
        ),
      );
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 16));
      }
      return repo;
    }

    testWidgets('marca, "Demais presentes" e fecha com a contagem',
        (tester) async {
      final repo = await pumpPage(tester);

      expect(find.text('Intermediário B'), findsOneWidget);
      expect(
        find.text('19:00–20:00 · QUADRA 2 · ARENA CFC'),
        findsOneWidget,
      );
      expect(find.text('EXPERIMENTAL'), findsOneWidget);
      expect(find.text('Falta'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel('Marcar presença de Ana Lima'));
      await tester.pump();
      await tester.tap(find.text('Demais presentes'));
      await tester.pump();
      expect(find.text('Fechar chamada · 2 presentes'), findsOneWidget);

      await tester.tap(find.text('Fechar chamada · 2 presentes'));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(repo.saves, hasLength(1));
      expect(repo.saves.single.marks, {
        's1': 'present',
        's2': 'absent',
        'x1': 'present',
      });
      expect(repo.saves.single.close, isTrue);
      expect(find.text('Chamada fechada · 2 presentes.'), findsOneWidget);
      // Volta para a agenda (sem pilha, cai na aba da agenda).
      expect(find.textContaining('agenda'), findsOneWidget);
    });

    testWidgets('fechar com aluno sem marca pede confirmação', (tester) async {
      final repo = await pumpPage(tester);

      await tester.tap(find.text('Fechar chamada · 0 presentes'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Fechar com alunos sem marca?'), findsOneWidget);
      await tester.tap(find.text('Voltar'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(repo.saves, isEmpty);
    });

    testWidgets('erro ao gravar mostra a mensagem do servidor', (tester) async {
      final repo = await pumpPage(tester);
      repo.saveError = const TeacherClassException(
        'Seu vínculo com a Arena CFC está suspenso — dá para fazer a chamada '
        'das suas aulas de novo quando a arena reativar.',
      );

      await tester.tap(find.text('Demais presentes'));
      await tester.pump();
      await tester.tap(find.text('Fechar chamada · 2 presentes'));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(find.textContaining('está suspenso'), findsOneWidget);
      expect(find.text('Intermediário B'), findsOneWidget);
    });

    testWidgets('aula futura: só a lista, sem marcar nem fechar',
        (tester) async {
      await pumpPage(
        tester,
        roster: _rosterMap(date: '2026-10-27', attendanceOpen: false),
      );

      expect(find.textContaining('A chamada abre no dia da aula (27/10)'),
          findsOneWidget);
      expect(find.textContaining('Fechar chamada'), findsNothing);
      expect(
        find.bySemanticsLabel('Marcar presença de Ana Lima'),
        findsNothing,
      );
    });

    testWidgets('sem permissão: a mensagem do servidor e tentar de novo',
        (tester) async {
      await pumpPage(
        tester,
        rosterError: const TeacherClassException(
          'A Arena CFC não liberou fazer a chamada das suas aulas no seu '
          'vínculo.',
        ),
      );

      expect(
          find.textContaining('não liberou fazer a chamada'), findsOneWidget);
    });
  });
}

class _FakeClassAgendaRepository extends ClassAgendaRepository {
  _FakeClassAgendaRepository({required this.roster, this.rosterError})
      : super(functions: _FakeFunctions());

  Map<String, Object?> roster;
  Object? rosterError;
  Object? saveError;
  final saves = <({Map<String, String?> marks, bool close})>[];

  @override
  Future<TeacherClassRoster> fetchTeacherRoster(String sessionId) async {
    final error = rosterError;
    if (error != null) throw error;
    return TeacherClassRoster.fromMap(roster);
  }

  @override
  Future<void> saveTeacherAttendance({
    required String sessionId,
    required Map<String, String?> marks,
    required bool close,
  }) async {
    saves.add((marks: marks, close: close));
    final error = saveError;
    if (error != null) throw error;
  }
}

class _FakeFunctions implements FirebaseFunctions {
  _FakeFunctions({this.responses = const {}, this.errors = const {}});

  final Map<String, Object?> responses;
  final Map<String, FirebaseFunctionsException> errors;
  final List<(String, Object?)> calls = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) =>
      _FakeCallable(this, name);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeCallable implements HttpsCallable {
  _FakeCallable(this._owner, this._name);

  final _FakeFunctions _owner;
  final String _name;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    _owner.calls.add((_name, parameters));
    final error = _owner.errors[_name];
    if (error != null) throw error;
    return _FakeResult<T>(_owner.responses[_name]);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeResult<T> implements HttpsCallableResult<T> {
  _FakeResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
