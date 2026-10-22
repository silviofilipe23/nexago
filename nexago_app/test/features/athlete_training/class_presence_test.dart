import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/location/location_permission_status.dart';
import 'package:nexago_app/core/location/user_location_providers.dart';
import 'package:nexago_app/core/location/user_location_service.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete/domain/agenda/teacher_class_roster.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/domain/athlete_training.dart';
import 'package:nexago_app/features/athlete_training/domain/class_presence.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/class_presence_repository.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_checkin_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/widgets/court_qr_scanner.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_classes_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_hub_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_makeup_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/widgets/athlete_training_home_entry.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_availability_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_evaluations_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_lesson_plans_providers.dart';

// Qua 21/10/2026 12:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 21, 15);

ClassAgendaEntry _class(
  String id,
  String date, {
  String start = '19:00',
  String end = '20:00',
  String? mark,
  String? rsvp,
  bool checkedIn = false,
  String kind = 'regular',
  int? notice = 4,
}) =>
    ClassAgendaEntry(
      sessionId: id,
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      classId: 'c1',
      className: 'Intermediário B',
      teacherName: 'Thiago Mendes',
      courtName: 'Quadra 2',
      date: date,
      startTime: start,
      endTime: end,
      startAt: null,
      status: 'scheduled',
      role: 'student',
      kind: kind,
      myMark: mark,
      myRsvp: rsvp,
      checkedIn: checkedIn,
      makeupNoticeHours: notice,
    );

TrainingSession _t(ClassAgendaEntry e) => trainingFromClass(e, _now)!;

const _credit = ClassMakeupCredit(
  creditId: 'cr1',
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  classId: 'c1',
  className: 'Intermediário B',
  level: 'intermediario',
  sourceDate: '2026-10-22',
  expiresOn: '2026-11-21',
);

ClassMakeupOption _option(
  String id,
  String date,
  String start, {
  int spots = 2,
  bool sameTeacher = false,
  String name = 'Intermediário A',
}) =>
    ClassMakeupOption(
      sessionId: id,
      classId: 'class_$id',
      className: name,
      teacherName: sameTeacher ? 'Thiago Mendes' : 'Juliana Rocha',
      courtName: 'Quadra 1',
      date: date,
      startTime: start,
      endTime: '21:00',
      spotsLeft: spots,
      full: spots == 0,
      sameTeacher: sameTeacher,
    );

class _Store {
  _Store(this.classes);

  List<ClassAgendaEntry> classes;
  List<ClassMakeupCredit> credits = const [];
  List<ClassMakeupOption> options = const [];
}

class _FakeRepo extends Fake implements ClassPresenceRepository {
  _FakeRepo(this.store);

  final _Store store;
  final calls = <String>[];
  ClassRsvpResult notGoingResult =
      const ClassRsvpResult(credit: 'granted', creditId: 'cr1');
  ClassPresenceException? checkInError;

  void _setRsvp(String sessionId, String rsvp, {String? mark}) {
    store.classes = [
      for (final c in store.classes)
        c.sessionId == sessionId
            ? _class(c.sessionId, c.date,
                start: c.startTime, end: c.endTime, rsvp: rsvp, mark: mark)
            : c,
    ];
  }

  @override
  Future<ClassRsvpResult> respond({
    required String sessionId,
    required bool going,
    String? reason,
    String? message,
  }) async {
    calls.add('respond $sessionId ${going ? 'going' : 'not_going'} '
        '${reason ?? '-'} ${message ?? '-'}');
    if (going) {
      _setRsvp(sessionId, 'going');
      return const ClassRsvpResult(credit: null);
    }
    _setRsvp(sessionId, 'not_going',
        mark: notGoingResult.credit == 'late' ? null : 'excused');
    if (notGoingResult.granted) store.credits = const [_credit];
    return notGoingResult;
  }

  @override
  Future<void> checkIn({
    required String sessionId,
    required double lat,
    required double lng,
    double? accuracy,
  }) async {
    calls.add('checkIn $sessionId $lat $lng');
    if (checkInError != null) throw checkInError!;
  }

  @override
  Future<void> checkInWithQr({
    required String sessionId,
    required String qr,
  }) async {
    calls.add('checkInQr $sessionId $qr');
    if (checkInError != null) throw checkInError!;
  }

  @override
  Future<List<ClassMakeupCredit>> fetchCredits() async => store.credits;

  @override
  Future<List<ClassMakeupOption>> fetchMakeupOptions(String creditId) async {
    calls.add('options $creditId');
    return store.options;
  }

  @override
  Future<void> bookMakeup({
    required String creditId,
    required String sessionId,
  }) async {
    calls.add('book $creditId $sessionId');
  }

  @override
  Future<bool> joinWaitlist({
    required String creditId,
    required String classId,
  }) async {
    calls.add('waitlist $creditId $classId');
    return false;
  }
}

class _FakeLocation extends Fake implements UserLocationService {
  _FakeLocation({this.status = LocationPermissionStatus.granted});

  LocationPermissionStatus status;

  @override
  Future<LocationPermissionStatus> ensurePermission() async => status;

  @override
  Future<UserLocationSnapshot?> tryCurrentPosition({
    Duration timeout = const Duration(seconds: 12),
  }) async =>
      const UserLocationSnapshot(
        source: UserLocationSource.gps,
        latitude: -16.68,
        longitude: -49.26,
      );
}

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

Future<GoRouter> _pump(
  WidgetTester tester, {
  required String location,
  required _FakeRepo repo,
  _FakeLocation? gps,
  String? scannedQr,
}) async {
  tester.view.physicalSize = const Size(400, 1800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.home,
        builder: (_, __) => const Scaffold(
          body: SingleChildScrollView(child: AthleteTrainingHomeEntry()),
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainings,
        name: AppRouteNames.athleteTrainings,
        builder: (_, __) => const AthleteTrainingHubPage(),
        routes: [
          GoRoute(
            path: 'aulas',
            name: AppRouteNames.athleteTrainingClasses,
            builder: (_, __) => const AthleteTrainingClassesPage(),
          ),
          GoRoute(
            path: 'reposicao',
            name: AppRouteNames.athleteTrainingMakeup,
            builder: (_, s) => AthleteTrainingMakeupPage(
              creditId: s.uri.queryParameters['credito'],
            ),
          ),
          GoRoute(
            path: 'checkin/:sessionId',
            name: AppRouteNames.athleteTrainingCheckIn,
            builder: (_, s) => AthleteTrainingCheckInPage(
              sessionId: s.pathParameters['sessionId'] ?? '',
            ),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.athletePrivateLessons,
        name: AppRouteNames.athletePrivateLessons,
        builder: (_, __) => _stub('particulares'),
      ),
      GoRoute(
        path: AppRoutes.athleteMessages,
        name: AppRouteNames.athleteMessages,
        builder: (_, __) => _stub('mensagens'),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue('me'),
        professorLinksClockProvider.overrideWithValue(() => _now),
        myClassAgendaProvider.overrideWith((ref) async => repo.store.classes),
        athleteTrainingClassHistoryProvider
            .overrideWith((ref) async => const []),
        athletePrivateLessonsProvider
            .overrideWith((ref) => Stream.value(const [])),
        athleteLessonPlanViewsProvider
            .overrideWith((ref) => Stream.value(const [])),
        receivedEvaluationsProvider
            .overrideWith((ref) => Stream.value(const [])),
        myProfessorsProvider.overrideWith((ref) async => const []),
        myClassChargesProvider.overrideWith((ref) async => const []),
        unreadMessagesCountProvider.overrideWith((ref) => 0),
        classPresenceRepositoryProvider.overrideWithValue(repo),
        userLocationServiceProvider.overrideWithValue(gps ?? _FakeLocation()),
        courtQrScanLauncherProvider
            .overrideWithValue((_) async => scannedQr),
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

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await _settle(tester);
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('regras puras', () {
    test('responder: aula da turma marcada, antes de começar, sem check-in',
        () {
      expect(trainingCanRespond(_t(_class('s1', '2026-10-22')), _now), isTrue);
      expect(
        trainingAwaitsResponse(_t(_class('s1', '2026-10-22')), _now),
        isTrue,
      );
      expect(
        trainingAwaitsResponse(
            _t(_class('s1', '2026-10-22', rsvp: 'going')), _now),
        isFalse,
      );
      // Começou às 11:00 de hoje (agora 12:00).
      expect(
        trainingCanRespond(
            _t(_class('s0', '2026-10-21', start: '11:00')), _now),
        isFalse,
      );
      expect(
        trainingCanRespond(
            _t(_class('s1', '2026-10-22', checkedIn: true)), _now),
        isFalse,
      );
      // Falta avisada pelo próprio aluno ainda dá para desfazer.
      expect(
        trainingCanRespond(
          _t(_class('s1', '2026-10-22', rsvp: 'not_going', mark: 'excused')),
          _now,
        ),
        isTrue,
      );
    });

    test('crédito: antecedência da arena (padrão 4h)', () {
      expect(
        trainingNoticeGivesCredit(
            _t(_class('s', '2026-10-21', start: '16:00')), _now),
        isTrue,
      );
      expect(
        trainingNoticeGivesCredit(
            _t(_class('s', '2026-10-21', start: '15:59')), _now),
        isFalse,
      );
      expect(
        trainingNoticeGivesCredit(
          _t(_class('s', '2026-10-21', start: '15:00', notice: 2)),
          _now,
        ),
        isTrue,
      );
      expect(
        trainingNoticeHours(
            _t(_class('s', '2026-10-21', start: '15:00', notice: null))),
        kDefaultMakeupNoticeHours,
      );
    });

    test('check-in: 60 min antes até o fim, sem marca nem check-in', () {
      expect(
        trainingCanCheckIn(
            _t(_class('s', '2026-10-21', start: '12:45', end: '13:45')), _now),
        isTrue,
      );
      expect(
        trainingCanCheckIn(
            _t(_class('s', '2026-10-21', start: '13:30', end: '14:30')), _now),
        isFalse,
      );
      expect(
        trainingCanCheckIn(
            _t(_class('s', '2026-10-21', start: '11:30', end: '12:30')), _now),
        isTrue,
      );
      expect(
        trainingCanCheckIn(
            _t(_class('s', '2026-10-21', start: '10:00', end: '11:30')), _now),
        isFalse,
      );
      expect(
        trainingCanCheckIn(
          _t(_class('s', '2026-10-21',
              start: '12:30', end: '13:30', mark: 'absent')),
          _now,
        ),
        isFalse,
      );
    });

    test('estado: check-in vira presente; não vou sem marca vira avisada', () {
      expect(_t(_class('s', '2026-10-22', checkedIn: true)).state,
          TrainingState.present);
      expect(_t(_class('s', '2026-10-22', rsvp: 'not_going')).state,
          TrainingState.excused);
      expect(trainingStateLabel(_t(_class('s', '2026-10-22', rsvp: 'going'))),
          'CONFIRMADA');
      expect(trainingStateLabel(_t(_class('s', '2026-10-22'))), 'AGENDADA');
    });

    test('crédito da aula casa por turma e data', () {
      expect(
          creditForTraining([_credit], _t(_class('s', '2026-10-22'))), _credit);
      expect(
          creditForTraining([_credit], _t(_class('s', '2026-10-29'))), isNull);
    });

    test('rótulos: dia/mês, quando repor, subtítulo da folha', () {
      expect(classDayMonthLabel('2026-11-21'), '21 nov');
      expect(makeupOptionWhen(_option('o', '2026-10-24', '08:00')),
          'Sáb 24 · 08:00');
      expect(trainingSheetSubtitle(_t(_class('s', '2026-10-22'))),
          'Qui 22 · 19:00 · Intermediário B · Arena CFC');
    });

    test('chamada do professor: resposta, motivo, mensagem e check-in', () {
      final s = TeacherClassRosterStudent.fromMap(const {
        'studentId': 'u1',
        'name': 'Marcelo',
        'kind': 'regular',
        'rsvp': 'not_going',
        'rsvpReason': 'health',
        'rsvpMessage': 'Torci o pé',
      });
      expect(teacherRosterAppStatus(s)?.text,
          'Não vai · Saúde / lesão · “Torci o pé”');
      expect(teacherRosterAppStatus(s)?.positive, isFalse);
      final going = TeacherClassRosterStudent.fromMap(
          const {'studentId': 'u2', 'name': 'Ana', 'rsvp': 'going'});
      expect(teacherRosterAppStatus(going)?.text, 'Confirmou presença');
      final checked = TeacherClassRosterStudent.fromMap(const {
        'studentId': 'u3',
        'name': 'Bia',
        'rsvp': 'going',
        'checkedIn': true,
      });
      expect(teacherRosterAppStatus(checked)?.text, 'Fez check-in na arena');
      // Servidor antigo: nada.
      expect(
        teacherRosterAppStatus(
            TeacherClassRosterStudent.fromMap(const {'studentId': 'x'})),
        isNull,
      );
    });

    test('agenda lê resposta, check-in e antecedência; servidor antigo não',
        () {
      final e = ClassAgendaEntry.fromMap(const {
        'sessionId': 's',
        'myRsvp': 'going',
        'checkedIn': true,
        'makeupNoticeHours': 6,
      });
      expect([e.myRsvp, e.checkedIn, e.makeupNoticeHours], ['going', true, 6]);
      final old = ClassAgendaEntry.fromMap(const {'sessionId': 's'});
      expect([old.myRsvp, old.checkedIn, old.makeupNoticeHours],
          [null, false, null]);
    });
  });

  group('T1/T2 · Confirmar presença no próximo treino', () {
    testWidgets('Início: confirmar vira "Vou" e o servidor recebe',
        (tester) async {
      final repo = _FakeRepo(_Store([_class('s1', '2026-10-22')]));
      await _pump(tester, location: AppRoutes.home, repo: repo);

      // Presença por confirmar: o cartão já abre expandido na Início.
      expect(find.byKey(const Key('training-next-compact')), findsNothing);
      expect(find.byKey(const Key('training-next-primary')), findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-presence-confirm')));
      expect(repo.calls, ['respond s1 going - -']);
      expect(find.byKey(const Key('training-presence-going')), findsOneWidget);
      expect(find.text('Presença confirmada.'), findsOneWidget);
    });

    testWidgets('Início: já confirmado, o cartão fica compacto', (
      tester,
    ) async {
      final repo =
          _FakeRepo(_Store([_class('s1', '2026-10-22', rsvp: 'going')]));
      await _pump(tester, location: AppRoutes.home, repo: repo);

      expect(find.byKey(const Key('training-next-compact')), findsOneWidget);
      expect(find.byKey(const Key('training-presence-going')), findsNothing);

      await _tap(tester, find.byKey(const Key('training-next-compact')));
      expect(find.byKey(const Key('training-presence-going')), findsOneWidget);
    });

    testWidgets('Início: recolher pela seta vale mesmo com presença pendente',
        (tester) async {
      final repo = _FakeRepo(_Store([_class('s1', '2026-10-22')]));
      await _pump(tester, location: AppRoutes.home, repo: repo);

      await _tap(tester, find.byKey(const Key('training-next-collapse')));
      expect(find.byKey(const Key('training-next-compact')), findsOneWidget);
      expect(find.byKey(const Key('training-presence-confirm')), findsNothing);
    });

    testWidgets('"Vou" abre o "Não vou"; "Não vou" volta para "Vou"',
        (tester) async {
      final repo =
          _FakeRepo(_Store([_class('s1', '2026-10-22', rsvp: 'going')]));
      await _pump(tester, location: AppRoutes.athleteTrainings, repo: repo);
      await _tap(tester, find.byKey(const Key('training-presence-going')));
      expect(find.byKey(const Key('training-not-going-sheet')), findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-not-going-notify')));
      expect(repo.calls.single, startsWith('respond s1 not_going work'));
      expect(
          find.byKey(const Key('training-presence-not-going')), findsOneWidget);

      await _tap(tester, find.byKey(const Key('training-presence-not-going')));
      expect(repo.calls.last, 'respond s1 going - -');
    });

    testWidgets('na janela da aula o botão vira "Fazer check-in"',
        (tester) async {
      final repo = _FakeRepo(
          _Store([_class('s1', '2026-10-21', start: '12:40', end: '13:40')]));
      await _pump(tester, location: AppRoutes.athleteTrainings, repo: repo);
      await _tap(tester, find.byKey(const Key('training-presence-checkin')));
      expect(find.byKey(const Key('training-checkin-hero')), findsOneWidget);
      expect(find.text('Aula começa em 40 min na Quadra 2'), findsOneWidget);
    });

    testWidgets('aula cancelada não ganha botão de presença', (tester) async {
      final repo = _FakeRepo(_Store([
        _class('s1', '2026-10-22', checkedIn: false).copyWithStatus('canceled'),
      ]));
      await _pump(tester, location: AppRoutes.athleteTrainings, repo: repo);
      expect(find.byKey(const Key('training-presence-confirm')), findsNothing);
    });
  });

  group('T3/T6 · Vou / Não vou em Minhas aulas', () {
    testWidgets('não vou com antecedência: motivo, mensagem e repor',
        (tester) async {
      final repo = _FakeRepo(_Store([
        _class('s1', '2026-10-22'),
        _class('s2', '2026-10-27'),
      ]))
        ..store.options = [_option('o1', '2026-10-24', '08:00')];
      await _pump(tester,
          location: AppRoutes.athleteTrainingClasses, repo: repo);

      expect(find.text('2 PRÓXIMAS · 2 A CONFIRMAR'), findsOneWidget);
      expect(find.byKey(const Key('training-row-going-s1')), findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-row-not-going-s1')));

      expect(find.text('Não vou à aula'), findsOneWidget);
      expect(find.text('Qui 22 · 19:00 · Intermediário B · Arena CFC'),
          findsOneWidget);
      expect(find.byKey(const Key('training-credit-yes')), findsOneWidget);
      await _tap(
          tester, find.byKey(const Key('training-not-going-reason-health')));
      await tester.enterText(
          find.byKey(const Key('training-not-going-message')), 'Torci o pé');
      await _tap(tester, find.byKey(const Key('training-not-going-makeup')));

      expect(repo.calls.first, 'respond s1 not_going health Torci o pé');
      // Abriu a escolha da reposição com o crédito novo.
      expect(find.text('Escolher reposição'), findsOneWidget);
      expect(repo.calls.last, 'options cr1');
    });

    testWidgets('em cima da hora: sem crédito e sem "Avisar e repor"',
        (tester) async {
      final repo =
          _FakeRepo(_Store([_class('s1', '2026-10-21', start: '14:00')]))
            ..notGoingResult = const ClassRsvpResult(credit: 'late');
      await _pump(tester,
          location: AppRoutes.athleteTrainingClasses, repo: repo);
      await _tap(tester, find.byKey(const Key('training-row-not-going-s1')));
      expect(find.byKey(const Key('training-credit-no')), findsOneWidget);
      expect(find.byKey(const Key('training-not-going-makeup')), findsNothing);
      await _tap(tester, find.byKey(const Key('training-not-going-notify')));
      expect(find.text('Você avisou que não vai'), findsOneWidget);
    });

    testWidgets('depois do não vou com crédito: link para a reposição',
        (tester) async {
      final repo = _FakeRepo(_Store([
        _class('s1', '2026-10-22', rsvp: 'not_going', mark: 'excused'),
      ]))
        ..store.credits = const [_credit];
      await _pump(tester,
          location: AppRoutes.athleteTrainingClasses, repo: repo);
      expect(find.text('+1 crédito de reposição · escolher horário'),
          findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-row-status-s1')));
      expect(find.text('Escolher reposição'), findsOneWidget);
    });

    testWidgets('vou direto da linha', (tester) async {
      final repo = _FakeRepo(_Store([_class('s1', '2026-10-22')]));
      await _pump(tester,
          location: AppRoutes.athleteTrainingClasses, repo: repo);
      await _tap(tester, find.byKey(const Key('training-row-going-s1')));
      expect(repo.calls, ['respond s1 going - -']);
      expect(find.text('Presença confirmada'), findsOneWidget);
    });
  });

  group('T7 · Escolher reposição', () {
    _FakeRepo makeupRepo() => _FakeRepo(_Store(const []))
      ..store.credits = const [_credit]
      ..store.options = [
        _option('o1', '2026-10-24', '08:00', name: 'Livre sábado'),
        _option('o2', '2026-10-27', '20:00', spots: 1, sameTeacher: true),
        _option('o3', '2026-10-28', '21:00', spots: 0, name: 'Noite'),
      ];

    testWidgets('padrão é a com vaga do seu professor; repor encaixa',
        (tester) async {
      final repo = makeupRepo();
      await _pump(tester,
          location: '${AppRoutes.athleteTrainingMakeup}?credito=cr1',
          repo: repo);
      expect(find.text('1 CRÉDITO · VÁLIDO ATÉ 21 NOV'), findsOneWidget);
      expect(find.textContaining('Turmas do nível Intermediário na Arena CFC'),
          findsOneWidget);
      expect(find.text('Juliana · seu professor'), findsNothing);
      expect(find.text('LOTADA'), findsOneWidget);
      expect(find.text('Repor em Ter 27 · 20:00'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('training-makeup-option-o1')));
      expect(find.text('Repor em Sáb 24 · 08:00'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-makeup-submit')));
      expect(repo.calls, contains('book cr1 o1'));
    });

    testWidgets('lotada: entra na fila', (tester) async {
      final repo = makeupRepo();
      await _pump(tester,
          location: AppRoutes.athleteTrainingMakeup, repo: repo);
      await _tap(tester, find.byKey(const Key('training-makeup-option-o3')));
      expect(find.text('Entrar na fila da turma'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-makeup-submit')));
      expect(repo.calls, contains('waitlist cr1 class_o3'));
      expect(find.text('Você entrou na fila. A arena avisa quando abrir vaga.'),
          findsOneWidget);
    });

    testWidgets('sem crédito: explica como ganhar', (tester) async {
      await _pump(tester,
          location: AppRoutes.athleteTrainingMakeup,
          repo: _FakeRepo(_Store(const [])));
      expect(
          find.byKey(const Key('training-makeup-no-credit')), findsOneWidget);
    });
  });

  group('T5 · Check-in', () {
    final inWindow = _class('s1', '2026-10-21', start: '12:30', end: '13:30');
    final checkInPath = '${AppRoutes.athleteTrainings}/checkin/s1';

    testWidgets('localização confirmada: presença registrada', (tester) async {
      final repo = _FakeRepo(_Store([inWindow]));
      await _pump(tester, location: checkInPath, repo: repo);
      expect(find.text('Check-in na Arena CFC'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-checkin-submit')));
      expect(repo.calls, ['checkIn s1 -16.68 -49.26']);
      expect(find.byKey(const Key('training-checkin-done')), findsOneWidget);
      expect(find.text('Check-in às 12:00 · o Thiago já vê você na chamada'),
          findsOneWidget);
    });

    testWidgets('longe da arena: mostra a mensagem do servidor',
        (tester) async {
      final repo = _FakeRepo(_Store([inWindow]))
        ..checkInError = const ClassPresenceException(
            'Você está a 330 m da arena. O check-in abre a até 100 m.');
      await _pump(tester, location: checkInPath, repo: repo);
      await _tap(tester, find.byKey(const Key('training-checkin-submit')));
      expect(find.textContaining('330 m da arena'), findsOneWidget);
      expect(find.byKey(const Key('training-checkin-done')), findsNothing);
    });

    testWidgets('sem permissão definitiva: oferece os ajustes', (tester) async {
      final repo = _FakeRepo(_Store([inWindow]));
      await _pump(tester,
          location: checkInPath,
          repo: repo,
          gps: _FakeLocation(status: LocationPermissionStatus.deniedForever));
      await _tap(tester, find.byKey(const Key('training-checkin-submit')));
      expect(repo.calls, isEmpty);
      expect(
          find.byKey(const Key('training-checkin-settings')), findsOneWidget);
    });

    const courtQr = 'nexago-checkin:v1:AbCdEfGhIjKlMnOpQrStUv';

    testWidgets('QR da quadra: presença registrada sem pedir localização',
        (tester) async {
      final repo = _FakeRepo(_Store([inWindow]));
      await _pump(tester,
          location: checkInPath,
          repo: repo,
          scannedQr: courtQr,
          gps: _FakeLocation(status: LocationPermissionStatus.deniedForever));
      await _tap(tester, find.byKey(const Key('training-checkin-qr')));
      expect(repo.calls, ['checkInQr s1 $courtQr']);
      expect(find.byKey(const Key('training-checkin-done')), findsOneWidget);
    });

    testWidgets('QR que não é do nexaGO: avisa e nem chama o servidor',
        (tester) async {
      final repo = _FakeRepo(_Store([inWindow]));
      await _pump(tester,
          location: checkInPath,
          repo: repo,
          scannedQr: 'https://cardapio.example/mesa/4');
      await _tap(tester, find.byKey(const Key('training-checkin-qr')));
      expect(repo.calls, isEmpty);
      expect(find.textContaining('não é de check-in do nexaGO'),
          findsOneWidget);
    });

    testWidgets('QR trocado pela arena: mostra a mensagem do servidor',
        (tester) async {
      final repo = _FakeRepo(_Store([inWindow]))
        ..checkInError = const ClassPresenceException(
            'Este QR não vale mais. Peça à recepção o QR atual da quadra.');
      await _pump(tester,
          location: checkInPath, repo: repo, scannedQr: courtQr);
      await _tap(tester, find.byKey(const Key('training-checkin-qr')));
      expect(find.textContaining('não vale mais'), findsOneWidget);
      expect(find.byKey(const Key('training-checkin-done')), findsNothing);
    });

    testWidgets('leitor fechado sem ler: nada acontece', (tester) async {
      final repo = _FakeRepo(_Store([inWindow]));
      await _pump(tester, location: checkInPath, repo: repo);
      await _tap(tester, find.byKey(const Key('training-checkin-qr')));
      expect(repo.calls, isEmpty);
      expect(find.byKey(const Key('training-checkin-error')), findsNothing);
    });

    test('isCourtCheckinQr só aceita o prefixo v1 com token', () {
      expect(isCourtCheckinQr('  $courtQr\n'), isTrue);
      expect(isCourtCheckinQr('nexago-checkin:v1:'), isFalse);
      expect(isCourtCheckinQr('arena1_q2'), isFalse);
    });

    testWidgets('fora da janela: botão desligado e aviso', (tester) async {
      final repo = _FakeRepo(_Store([_class('s1', '2026-10-22')]));
      await _pump(tester, location: checkInPath, repo: repo);
      expect(
          find.text('O check-in abre 60 min antes da aula.'), findsOneWidget);
      final button = tester.widget<FilledButton>(find.descendant(
        of: find.byKey(const Key('training-checkin-submit')),
        matching: find.byType(FilledButton),
      ));
      expect(button.onPressed, isNull);
      final qr = tester.widget<OutlinedButton>(find.descendant(
        of: find.byKey(const Key('training-checkin-qr')),
        matching: find.byType(OutlinedButton),
      ));
      expect(qr.onPressed, isNull);
    });
  });
}

extension on ClassAgendaEntry {
  ClassAgendaEntry copyWithStatus(String status) => ClassAgendaEntry(
        sessionId: sessionId,
        arenaId: arenaId,
        arenaName: arenaName,
        classId: classId,
        className: className,
        teacherName: teacherName,
        courtName: courtName,
        date: date,
        startTime: startTime,
        endTime: endTime,
        startAt: startAt,
        status: status,
        role: role,
        kind: kind,
      );
}
