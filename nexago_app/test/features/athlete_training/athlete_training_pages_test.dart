import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_classes_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_evolution_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_feedbacks_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_hub_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_professors_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/widgets/athlete_training_home_entry.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_availability_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_evaluations_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_lesson_plans_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_evaluations.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete_training/domain/training_plans.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_plans_page.dart';

// Qua 21/10/2026 12:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 21, 15);

ClassAgendaEntry _class(
  String id,
  String date, {
  String? mark,
  String teacher = 'Thiago Mendes',
  String start = '19:00',
}) =>
    ClassAgendaEntry(
      sessionId: id,
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      classId: 'c1',
      className: 'Intermediário B',
      teacherName: teacher,
      courtName: 'Quadra 2',
      date: date,
      startTime: start,
      endTime: '20:00',
      startAt: null,
      status: 'scheduled',
      role: 'student',
      kind: 'regular',
      myMark: mark,
    );

PrivateLesson _private(String id, DateTime start,
        {PrivateLessonStatus status = PrivateLessonStatus.pending}) =>
    PrivateLesson(
      id: id,
      professorUid: 'pv',
      professorName: 'Paula Viana',
      athleteId: 'me',
      athleteName: 'Eu',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      durationMin: 60,
      status: status,
    );

LessonPlanView _view(
  String id, {
  String professor = 'Thiago Mendes',
  String? feedback,
  DateTime? sentAt,
  String? focus,
  String planId = '',
  LessonHomework? homework,
}) =>
    LessonPlanView(
      id: id,
      planId: planId.isEmpty ? 'tm_session_$id' : planId,
      professorName: professor,
      lessonTitle: 'Intermediário B',
      date: '2026-10-20',
      myFocus: focus,
      feedback: feedback == null
          ? null
          : LessonViewFeedback(
              text: feedback,
              sentAt: sentAt,
              homework: homework,
            ),
    );

ProfessorEvaluation _evaluation() => const ProfessorEvaluation(
      id: 'tm_me_2026-10',
      professorUid: 'tm',
      professorName: 'Thiago Mendes',
      athleteId: 'me',
      period: '2026-10',
      sport: kEvaluationDefaultSport,
      scores: {'saque': 6.5},
      previousScores: {'saque': 5.5},
      overall: 6.4,
      previousOverall: 6.0,
      status: ProfessorEvaluationStatus.sent,
      comment: 'Saque foi o que mais evoluiu.',
    );

class _Data {
  _Data({
    this.classes = const [],
    this.history = const [],
    this.privates = const [],
    this.views = const [],
    this.evaluations = const [],
    this.professors = const [],
    this.plans = const MyTrainingPlans(),
    this.charges = const [],
  });

  final MyTrainingPlans plans;
  final List<ClassChargeEntry> charges;

  final List<ClassAgendaEntry> classes;
  final List<ClassAgendaEntry> history;
  final List<PrivateLesson> privates;
  final List<LessonPlanView> views;
  final List<ProfessorEvaluation> evaluations;
  final List<MyProfessor> professors;
}

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

Future<GoRouter> _pump(
  WidgetTester tester, {
  required String location,
  required _Data data,
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
            path: 'feedbacks',
            name: AppRouteNames.athleteTrainingFeedbacks,
            builder: (_, __) => const AthleteTrainingFeedbacksPage(),
          ),
          GoRoute(
            path: 'evolucao',
            name: AppRouteNames.athleteTrainingEvolution,
            builder: (_, __) => const AthleteTrainingEvolutionPage(),
          ),
          GoRoute(
            path: 'professores',
            name: AppRouteNames.athleteTrainingProfessors,
            builder: (_, __) => const AthleteTrainingProfessorsPage(),
          ),
          GoRoute(
            path: 'planos',
            name: AppRouteNames.athleteTrainingPlans,
            builder: (_, __) => const AthleteTrainingPlansPage(),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.athletePrivateLessons,
        name: AppRouteNames.athletePrivateLessons,
        builder: (_, __) => _stub('particulares'),
        routes: [
          GoRoute(
            path: 'agendar/:professorUid',
            name: AppRouteNames.athletePrivateLessonBook,
            builder: (_, s) =>
                _stub('agendar ${s.pathParameters['professorUid']}'),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.athleteLessonPlan,
        name: AppRouteNames.athleteLessonPlan,
        builder: (_, s) => _stub('plano ${s.pathParameters['viewId']}'),
      ),
      GoRoute(
        path: AppRoutes.athleteEvaluation,
        name: AppRouteNames.athleteEvaluation,
        builder: (_, s) =>
            _stub('avaliacao ${s.pathParameters['evaluationId']}'),
      ),
      GoRoute(
        path: AppRoutes.lessonPaymentReceipt,
        name: AppRouteNames.lessonPaymentReceipt,
        builder: (_, s) => _stub('comprovante ${s.pathParameters['chargeId']}'),
      ),
      GoRoute(
        path: AppRoutes.athleteMessages,
        name: AppRouteNames.athleteMessages,
        builder: (_, __) => _stub('mensagens'),
      ),
      GoRoute(
        path: AppRoutes.discover,
        builder: (_, s) =>
            _stub('shell ${s.uri.queryParameters['tab'] ?? 'inicio'}'),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue('me'),
        professorLinksClockProvider.overrideWithValue(() => _now),
        myClassAgendaProvider.overrideWith((ref) async => data.classes),
        athleteTrainingClassHistoryProvider
            .overrideWith((ref) async => data.history),
        athletePrivateLessonsProvider
            .overrideWith((ref) => Stream.value(data.privates)),
        athleteLessonPlanViewsProvider
            .overrideWith((ref) => Stream.value(data.views)),
        receivedEvaluationsProvider
            .overrideWith((ref) => Stream.value(data.evaluations)),
        myProfessorsProvider.overrideWith((ref) async => data.professors),
        myClassChargesProvider.overrideWith((ref) async => data.charges),
        athleteTrainingPlansProvider.overrideWith((ref) async => data.plans),
        unreadMessagesCountProvider.overrideWith((ref) => 0),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  return router;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('T1 · entrada na Início', () {
    testWidgets('quem não treina com professor não vê nada', (tester) async {
      await _pump(tester, location: AppRoutes.home, data: _Data());
      expect(
          find.byKey(const Key('athlete-training-home-entry')), findsNothing);
    });

    testWidgets('próximo treino com foco e feedback novo', (tester) async {
      final router = await _pump(
        tester,
        location: AppRoutes.home,
        data: _Data(
          classes: [_class('s1', '2026-10-22')],
          views: [
            _view('s1', focus: 'Flexionar o joelho no saque'),
            _view('s0',
                feedback: 'Joelho bem melhor!',
                sentAt: _now.subtract(const Duration(hours: 2))),
          ],
        ),
      );
      // Presença por confirmar: já abre expandido, sem precisar da seta.
      expect(find.byKey(const Key('training-next-compact')), findsNothing);
      expect(find.byKey(const Key('training-next-card')), findsOneWidget);
      expect(find.text('Amanhã · 19:00'), findsOneWidget);
      expect(find.text('Flexionar o joelho no saque'), findsOneWidget);
      expect(find.text('Feedback novo do Thiago'), findsOneWidget);
      // Badge do feedback novo (com plano + presença, no cabeçalho do cartão).
      expect(find.text('1'), findsOneWidget);
      expect(find.byKey(const Key('training-presence-confirm')), findsOneWidget);

      // Plano e presença ocupam os botões: o cartão leva ao hub.
      await tester.tap(find.text('Amanhã · 19:00'));
      await _settle(tester);
      expect(router.state.uri.path, AppRoutes.athleteTrainings);
    });

    testWidgets('sem aula marcada nem feedback novo: não aparece', (
      tester,
    ) async {
      await _pump(
        tester,
        location: AppRoutes.home,
        data: _Data(views: [_view('v1')]),
      );
      expect(
          find.byKey(const Key('athlete-training-home-entry')), findsNothing);
      expect(find.byKey(const Key('training-next-compact')), findsNothing);
    });

    testWidgets('sem aula marcada mas com feedback novo: só o feedback', (
      tester,
    ) async {
      await _pump(
        tester,
        location: AppRoutes.home,
        data: _Data(views: [
          _view('v1',
              feedback: 'Joelho bem melhor!',
              sentAt: _now.subtract(const Duration(hours: 2))),
        ]),
      );
      expect(find.byKey(const Key('athlete-training-home-feedback')),
          findsOneWidget);
      expect(find.byKey(const Key('training-next-compact')), findsNothing);
      expect(find.byKey(const Key('training-next-card')), findsNothing);
    });
  });

  group('T2 · hub', () {
    testWidgets('mantém o menu do atleta e troca de aba pelo shell', (
      tester,
    ) async {
      final router = await _pump(
        tester,
        location: AppRoutes.athleteTrainings,
        data: _Data(classes: [_class('s1', '2026-10-22')]),
      );
      expect(find.byKey(const Key('training-hub-tab-bar')), findsOneWidget);

      await tester.tap(find.descendant(
        of: find.byKey(const Key('training-hub-tab-bar')),
        matching: find.byIcon(Icons.calendar_today_outlined),
      ));
      await _settle(tester);
      expect(router.state.uri.path, AppRoutes.discover);
      expect(find.text('shell agenda'), findsOneWidget);
    });

    testWidgets('próximo treino, números e o que o professor mandou',
        (tester) async {
      final router = await _pump(
        tester,
        location: AppRoutes.athleteTrainings,
        data: _Data(
          classes: [
            _class('p1', '2026-10-06', mark: 'present'),
            _class('p2', '2026-10-13', mark: 'present'),
            _class('p3', '2026-10-20', mark: 'present'),
            _class('n1', '2026-10-22'),
            _class('n2', '2026-10-27'),
          ],
          privates: [_private('l1', DateTime.utc(2026, 10, 24, 12))],
          views: [
            _view('fb',
                feedback: 'Bom treino',
                sentAt: _now.subtract(const Duration(days: 1)),
                homework: const LessonHomework(name: 'Lançamento + flexão')),
          ],
          evaluations: [_evaluation()],
          professors: const [
            MyProfessor(professorUid: 'tm', name: 'Thiago Mendes'),
          ],
        ),
      );
      expect(find.byKey(const Key('training-next-card')), findsOneWidget);
      expect(find.text('100%'), findsOneWidget);
      expect(find.byKey(const Key('training-hub-latest-feedback')),
          findsOneWidget);
      expect(find.text('Tarefa: Lançamento + flexão'), findsOneWidget);
      expect(find.byKey(const Key('training-hub-evaluation')), findsOneWidget);
      // Próximas: a particular pendente e a terça.
      expect(find.byKey(const Key('training-hub-row-l1')), findsOneWidget);
      expect(find.byKey(const Key('training-hub-row-n2')), findsOneWidget);
      expect(find.text('AGUARDANDO'), findsOneWidget);

      await tester.tap(find.byKey(const Key('training-hub-evaluation')));
      await _settle(tester);
      expect(find.text('avaliacao tm_me_2026-10'), findsOneWidget);
      router.pop();
      await _settle(tester);
      await tester.pump(const Duration(seconds: 1));

      await tester.tap(find.byKey(const Key('training-hub-classes')));
      await _settle(tester);
      expect(router.state.uri.path, AppRoutes.athleteTrainingClasses);
    });

    testWidgets('sem aula marcada oferece agendar particular', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainings,
        data: _Data(
          professors: const [MyProfessor(professorUid: 'tm', name: 'Thiago')],
        ),
      );
      expect(find.byKey(const Key('training-hub-empty')), findsOneWidget);
      await tester.tap(find.byKey(const Key('training-hub-book')));
      await _settle(tester);
      expect(find.text('particulares'), findsOneWidget);
    });
  });

  group('T3 · minhas aulas', () {
    testWidgets('próximas, histórico e filtro por professor', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingClasses,
        data: _Data(
          classes: [
            _class('n1', '2026-10-22'),
            _class('h1', '2026-10-15', mark: 'excused'),
          ],
          history: [
            _class('h1', '2026-10-15', mark: 'excused'), // repetida
            _class('h2', '2026-10-13',
                mark: 'present', teacher: 'Juliana Rocha'),
          ],
          privates: [_private('l1', DateTime.utc(2026, 10, 24, 12))],
        ),
      );
      expect(find.byKey(const Key('training-classes-row-n1')), findsOneWidget);
      expect(find.byKey(const Key('training-classes-row-l1')), findsOneWidget);
      expect(find.byKey(const Key('training-classes-row-h1')), findsNothing);
      expect(find.text('O professor ainda vai confirmar o horário.'),
          findsOneWidget);

      await tester.tap(find.byKey(const Key('training-filter-Paula')));
      await _settle(tester);
      expect(find.byKey(const Key('training-classes-row-n1')), findsNothing);
      expect(find.byKey(const Key('training-classes-row-l1')), findsOneWidget);

      await tester.tap(find.byKey(const Key('training-filter-all')));
      await tester.tap(find.text('Histórico'));
      await _settle(tester);
      expect(find.byKey(const Key('training-classes-row-h1')), findsOneWidget);
      expect(find.byKey(const Key('training-classes-row-h2')), findsOneWidget);
      expect(find.text('FALTA AVISADA'), findsOneWidget);
      expect(find.text('PRESENTE'), findsOneWidget);
    });
  });

  group('T7 · feedbacks', () {
    testWidgets('lista, novo em destaque e filtro', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingFeedbacks,
        data: _Data(views: [
          _view('a',
              feedback: 'Joelho bem melhor!',
              sentAt: _now.subtract(const Duration(hours: 3))),
          _view('b',
              professor: 'Paula Viana',
              feedback: 'Ótima explosão lateral.',
              sentAt: _now.subtract(const Duration(days: 9))),
          _view('c'), // sem feedback
        ]),
      );
      expect(find.byKey(const Key('training-feedback-a')), findsOneWidget);
      expect(find.byKey(const Key('training-feedback-b')), findsOneWidget);
      expect(find.byKey(const Key('training-feedback-c')), findsNothing);
      expect(find.textContaining('NOVO'), findsWidgets);

      await tester.tap(find.byKey(const Key('training-filter-Paula')));
      await _settle(tester);
      expect(find.byKey(const Key('training-feedback-a')), findsNothing);

      await tester.tap(find.byKey(const Key('training-feedback-b')));
      await _settle(tester);
      expect(find.text('plano b'), findsOneWidget);
    });
  });

  group('T8 · evolução', () {
    testWidgets('fundamentos e frequência', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingEvolution,
        data: _Data(
          evaluations: [_evaluation()],
          classes: [_class('p1', '2026-10-20', mark: 'present')],
          history: [_class('p0', '2026-09-15', mark: 'present')],
        ),
      );
      expect(find.text('Saque foi o que mais evoluiu.'), findsOneWidget);

      await tester.tap(find.text('Frequência'));
      await _settle(tester);
      expect(find.byKey(const Key('training-frequency-chart')), findsOneWidget);
      expect(find.text('2 EM 6 MESES'), findsOneWidget);
      expect(find.text('OUT'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('sem avaliação', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingEvolution,
        data: _Data(),
      );
      expect(find.byKey(const Key('training-evolution-empty')), findsOneWidget);
    });
  });

  group('T10 · professores', () {
    testWidgets('próximo treino com cada um e agendar', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingProfessors,
        data: _Data(
          classes: [_class('n1', '2026-10-22')],
          privates: [
            _private('l1', DateTime.utc(2026, 10, 24, 12),
                status: PrivateLessonStatus.confirmed),
          ],
          professors: const [
            MyProfessor(professorUid: 'tm', name: 'Thiago Mendes'),
            MyProfessor(professorUid: 'pv', name: 'Paula Viana'),
          ],
        ),
      );
      expect(find.text('PRÓXIMA · AMANHÃ 19:00'), findsOneWidget);
      expect(find.text('PRÓXIMA · SÁB 24 09:00'), findsOneWidget);

      await tester.tap(find.byKey(const Key('training-professor-book-pv')));
      await _settle(tester);
      expect(find.text('agendar pv'), findsOneWidget);
    });

    testWidgets('sem professor', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingProfessors,
        data: _Data(),
      );
      expect(
          find.byKey(const Key('training-professors-empty')), findsOneWidget);
    });
  });

  group('T14 · planos e pagamentos', () {
    const plans = MyTrainingPlans(
      arenaPlans: [
        ArenaTrainingPlan(
          enrollmentId: 'e1',
          arenaName: 'Arena CFC',
          planName: 'Trimestral',
          kind: 'monthly',
          priceReais: 373.33,
          paymentMethod: 'pix',
          billingMode: 'asaas',
          billedThrough: '2026-11-14',
          dueDay: 15,
          makeupCredits: 1,
          slots: [
            ArenaPlanSlot(
              className: 'Intermediário B',
              weekday: 2,
              startTime: '19:00',
              teacherName: 'Thiago Mendes',
            ),
            ArenaPlanSlot(
              className: 'Intermediário B',
              weekday: 4,
              startTime: '19:00',
              teacherName: 'Thiago Mendes',
            ),
          ],
        ),
      ],
      professorPlans: [
        ProfessorTrainingPlan(
          professorUid: 'tm',
          professorName: 'Thiago Mendes',
          planName: 'Pacote 8 aulas/mês',
          kind: 'monthly',
          classes: 8,
          recurringReais: 880,
          recurringDueDay: 21,
        ),
      ],
      payments: [
        TrainingPayment(
          fromProfessor: true,
          chargeId: 'pc1',
          payee: 'Prof. Thiago Mendes',
          description: 'Particular · novembro',
          amountReais: 880,
          paidOn: '2026-10-21',
          method: 'Pix',
        ),
        TrainingPayment(
          fromProfessor: false,
          chargeId: 'm1',
          payee: 'Arena CFC',
          description: 'Turma trimestral',
          amountReais: 373.33,
          paidOn: '2026-10-15',
          method: 'Online',
        ),
      ],
    );

    testWidgets('arena e professor lado a lado, pagamentos e comprovante',
        (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingPlans,
        data: _Data(
          plans: plans,
          charges: const [
            ClassChargeEntry(
              chargeId: 'c9',
              arenaId: 'arena1',
              arenaName: 'Arena CFC',
              description: 'Mensalidade dez',
              amountReais: 373.33,
              dueDate: '2026-10-20',
              overdue: true,
              payment: 'online',
            ),
          ],
        ),
      );
      expect(find.text('2 ATIVOS · 1 EM ABERTO'), findsOneWidget);
      expect(find.byKey(const Key('training-plans-open-c9')), findsOneWidget);
      expect(find.byKey(const Key('training-plan-arena-e1')), findsOneWidget);
      expect(find.text('COBRADO PELA ARENA CFC'), findsOneWidget);
      expect(find.text('Turma Intermediário B'), findsOneWidget);
      expect(find.text('Ter e Qui · 19:00 · Prof. Thiago Mendes'),
          findsOneWidget);
      expect(find.text('1 disponível'), findsOneWidget);
      expect(find.byKey(const Key('training-plan-professor-tm')),
          findsOneWidget);
      expect(find.text('COBRADO PELO PROF. THIAGO MENDES'), findsOneWidget);

      await tester.tap(find.byKey(const Key('training-payment-pc1')));
      await _settle(tester);
      expect(find.text('comprovante pc1'), findsOneWidget);
    });

    testWidgets('sem plano', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainingPlans,
        data: _Data(),
      );
      expect(find.byKey(const Key('training-plans-empty')), findsOneWidget);
    });

    testWidgets('hub mostra Meus planos e leva aos pagamentos',
        (tester) async {
      final router = await _pump(
        tester,
        location: AppRoutes.athleteTrainings,
        data: _Data(plans: plans),
      );
      expect(find.byKey(const Key('training-hub-plan-e1')), findsOneWidget);
      expect(find.byKey(const Key('training-hub-plan-tm')), findsOneWidget);
      await tester.tap(find.text('Pagamentos'));
      await _settle(tester);
      expect(router.state.uri.path, AppRoutes.athleteTrainingPlans);
    });
  });
}
