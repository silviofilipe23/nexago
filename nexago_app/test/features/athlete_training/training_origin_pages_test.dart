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
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';
import 'package:nexago_app/features/athlete_training/domain/training_plans.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_agenda_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_arena_class_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_center_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_center_session_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_hub_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_plans_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_private_link_page.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_availability_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_evaluations_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_lesson_plans_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';

import 'package:nexago_app/features/athlete_training/infrastructure/class_presence_repository.dart';
import 'package:nexago_app/features/athlete_training/infrastructure/training_centers_repository.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_add_page.dart';
import 'package:nexago_app/features/athlete_training/presentation/athlete_training_center_invoice_page.dart';

import 'center_contract_test.dart' show contractJson;
import 'training_origin_test.dart' show centerResponse;

/// Repositório do CT em memória: guarda as chamadas e devolve o que o teste
/// mandou.
class _FakeCenters implements TrainingCentersRepository {
  _FakeCenters({required this.data});

  MyTrainingCentersData data;
  final calls = <String>[];
  String checkStatus = 'pending';
  bool excused = true;

  @override
  Future<MyTrainingCentersData> fetch() async => data;

  @override
  Future<bool> respond({
    required String centerId,
    required String sessionId,
    required bool going,
  }) async {
    calls.add('respond $sessionId ${going ? 'going' : 'not_going'}');
    return !going && excused;
  }

  @override
  Future<void> answerInvite({
    required String centerId,
    required String studentId,
    required bool accept,
  }) async {
    calls.add('invite $studentId $accept');
    data = MyTrainingCentersData(centers: data.centers);
  }

  @override
  Future<CenterInvoicePix> invoicePix({
    required String centerId,
    required String invoiceId,
  }) async {
    calls.add('pix $invoiceId');
    return const CenterInvoicePix(
      status: 'pending',
      invoiceUrl: 'https://www.asaas.com/i/1',
      pixPayload: '00020126PIXCODE',
    );
  }

  @override
  Future<({String centerId, String centerName, bool already})> joinByCode(
    String code,
  ) async {
    calls.add('join $code');
    if (code != 'XK7-Q2M') {
      throw const ClassPresenceException('Código não encontrado.');
    }
    return (centerId: 'ct1', centerName: 'CT Areia Alta', already: false);
  }

  @override
  Future<String> checkInvoice({
    required String centerId,
    required String invoiceId,
  }) async {
    calls.add('check $invoiceId');
    return checkStatus;
  }

  // Contratos: cobertos em `center_contract_pages_test.dart`.
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

const _invite = CenterInvite(
  centerId: 'ct2',
  studentId: 'inv1',
  centerName: 'CT Vôlei Rio',
  city: 'Rio de Janeiro',
  state: 'RJ',
  invitedAt: '2026-10-21',
  enrollments: [
    CenterEnrollment(
      enrollmentId: '',
      classId: 'k9',
      className: 'Sub-17 Feminino',
      status: 'pending',
      planName: 'Mensal',
      priceCents: 32000,
      weekdays: [2, 4],
      startTime: '17:00',
    ),
  ],
);

// Qua 21/10/2026 12:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 21, 15);

final _arenaClass = ClassAgendaEntry(
  sessionId: 's1',
  arenaId: 'a1',
  arenaName: 'Arena CFC',
  classId: 'c1',
  className: 'Intermediário B',
  teacherName: 'Juliana Rocha',
  courtName: 'Quadra 2',
  date: '2026-10-22',
  startTime: '19:00',
  endTime: '20:00',
  startAt: null,
  status: 'scheduled',
  role: 'student',
  kind: 'regular',
  makeupNoticeHours: 4,
);

final _privateLesson = PrivateLesson(
  id: 'p1',
  professorUid: 'tm',
  professorName: 'Thiago Mendes',
  athleteId: 'me',
  athleteName: 'Eu',
  startAt: DateTime.utc(2026, 10, 24, 12),
  endAt: DateTime.utc(2026, 10, 24, 13),
  durationMin: 60,
  status: PrivateLessonStatus.confirmed,
);

const _plans = MyTrainingPlans(
  arenaPlans: [
    ArenaTrainingPlan(
      enrollmentId: 'ae1',
      arenaId: 'a1',
      arenaName: 'Arena CFC',
      planName: 'Trimestral',
      kind: 'monthly',
      priceReais: 380,
      paymentMethod: 'pix',
      slots: [
        ArenaPlanSlot(
          classId: 'c1',
          className: 'Intermediário B',
          weekday: 4,
          startTime: '19:00',
          teacherName: 'Juliana Rocha',
        ),
      ],
    ),
  ],
  professorPlans: [
    ProfessorTrainingPlan(
      professorUid: 'tm',
      professorName: 'Thiago Mendes',
      planName: 'Pacote 8 aulas',
      kind: 'package',
      classes: 8,
    ),
  ],
);

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

Future<GoRouter> _pump(
  WidgetTester tester, {
  required String location,
  bool withCenter = true,
  bool withArenaAndPrivate = true,
  List<CenterInvite> invites = const [],
  _FakeCenters? repo,
}) async {
  tester.view.physicalSize = const Size(400, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final centers = withCenter
      ? trainingCentersFromResponse(centerResponse())
      : const <TrainingCenterLink>[];
  final fake =
      repo ??
      _FakeCenters(
        data: MyTrainingCentersData(centers: centers, invites: invites),
      );

  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.athleteTrainings,
        name: AppRouteNames.athleteTrainings,
        builder: (_, __) => const AthleteTrainingHubPage(),
        routes: [
          GoRoute(
            path: 'aulas',
            name: AppRouteNames.athleteTrainingClasses,
            builder: (_, __) => _stub('aulas'),
          ),
          GoRoute(
            path: 'feedbacks',
            name: AppRouteNames.athleteTrainingFeedbacks,
            builder: (_, __) => _stub('feedbacks'),
          ),
          GoRoute(
            path: 'planos',
            name: AppRouteNames.athleteTrainingPlans,
            builder: (_, __) => const AthleteTrainingPlansPage(),
          ),
          GoRoute(
            path: 'adicionar',
            name: AppRouteNames.athleteTrainingAdd,
            builder: (_, __) => const AthleteTrainingAddPage(),
          ),
          GoRoute(
            path: 'encontrar',
            name: AppRouteNames.athleteTrainingFindProfessor,
            builder: (_, __) => _stub('encontrar'),
          ),
          GoRoute(
            path: 'agenda',
            name: AppRouteNames.athleteTrainingAgenda,
            builder: (_, __) => const AthleteTrainingAgendaPage(),
          ),
          GoRoute(
            path: 'particular/:professorUid',
            name: AppRouteNames.athleteTrainingPrivateLink,
            builder: (_, s) => AthleteTrainingPrivateLinkPage(
              professorUid: s.pathParameters['professorUid']!,
            ),
          ),
          GoRoute(
            path: 'arena/:enrollmentId',
            name: AppRouteNames.athleteTrainingArenaClass,
            builder: (_, s) => AthleteTrainingArenaClassPage(
              enrollmentId: s.pathParameters['enrollmentId']!,
            ),
          ),
          GoRoute(
            path: 'centro/:centerId',
            name: AppRouteNames.athleteTrainingCenter,
            builder: (_, s) => AthleteTrainingCenterPage(
              centerId: s.pathParameters['centerId']!,
              initialTab: s.uri.queryParameters['aba'],
            ),
            routes: [
              GoRoute(
                path: 'aula/:sessionId',
                name: AppRouteNames.athleteTrainingCenterSession,
                builder: (_, s) => AthleteTrainingCenterSessionPage(
                  centerId: s.pathParameters['centerId']!,
                  sessionId: s.pathParameters['sessionId']!,
                ),
              ),
              GoRoute(
                path: 'fatura/:invoiceId',
                name: AppRouteNames.athleteTrainingCenterInvoice,
                builder: (_, s) => AthleteTrainingCenterInvoicePage(
                  centerId: s.pathParameters['centerId']!,
                  invoiceId: s.pathParameters['invoiceId']!,
                ),
              ),
            ],
          ),
          GoRoute(
            path: 'professor/:professorUid',
            name: AppRouteNames.athleteTrainingProfessorProfile,
            builder: (_, s) =>
                _stub('perfil ${s.pathParameters['professorUid']}'),
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
        myClassAgendaProvider.overrideWith(
          (ref) async => withArenaAndPrivate ? [_arenaClass] : const [],
        ),
        athleteTrainingClassHistoryProvider.overrideWith(
          (ref) async => const [],
        ),
        athletePrivateLessonsProvider.overrideWith(
          (ref) =>
              Stream.value(withArenaAndPrivate ? [_privateLesson] : const []),
        ),
        athleteLessonPlanViewsProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
        receivedEvaluationsProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
        myProfessorsProvider.overrideWith((ref) async => const []),
        myClassChargesProvider.overrideWith((ref) async => const []),
        athleteTrainingPlansProvider.overrideWith(
          (ref) async => withArenaAndPrivate ? _plans : const MyTrainingPlans(),
        ),
        athleteClassCreditsProvider.overrideWith((ref) async => const []),
        trainingCentersRepositoryProvider.overrideWithValue(fake),
        unreadMessagesCountProvider.overrideWith((ref) => 0),
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

  group('O1 · hub por origem', () {
    testWidgets('filtro e um cartão por vínculo, cada um abre o seu detalhe', (
      tester,
    ) async {
      final router = await _pump(tester, location: AppRoutes.athleteTrainings);
      expect(
        find.byKey(const Key('training-hub-origin-filter')),
        findsOneWidget,
      );
      expect(find.text('3 VÍNCULOS · 4 AULAS'), findsOneWidget);
      expect(
        find.byKey(const Key('training-hub-link-private-tm')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('training-hub-link-arena-ae1')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('training-hub-link-center-ct1')),
        findsOneWidget,
      );
      expect(find.text('Local muda Seg 26'), findsOneWidget);

      // Só o centro: some o particular e a arena.
      await _tap(tester, find.byKey(const Key('training-origin-center')));
      expect(
        find.byKey(const Key('training-hub-link-arena-ae1')),
        findsNothing,
      );
      expect(
        find.byKey(const Key('training-hub-link-center-ct1')),
        findsOneWidget,
      );

      await _tap(tester, find.byKey(const Key('training-hub-link-center-ct1')));
      expect(router.state.uri.path, '/treinos/centro/ct1');
    });

    testWidgets('sem o centro: particular e arena ainda filtram', (
      tester,
    ) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainings,
        withCenter: false,
      );
      expect(
        find.byKey(const Key('training-hub-origin-filter')),
        findsOneWidget,
      );
    });

    testWidgets('só o centro: hub sem filtro, mas com o vínculo', (
      tester,
    ) async {
      await _pump(
        tester,
        location: AppRoutes.athleteTrainings,
        withArenaAndPrivate: false,
      );
      expect(find.byKey(const Key('training-hub-origin-filter')), findsNothing);
      expect(
        find.byKey(const Key('training-hub-link-center-ct1')),
        findsOneWidget,
      );
    });
  });

  group('O2 · agenda unificada', () {
    testWidgets('semana com as três origens, filtro e dia', (tester) async {
      await _pump(tester, location: AppRoutes.athleteTrainingAgenda);
      expect(find.byKey(const Key('training-agenda-row-s1')), findsOneWidget);
      expect(find.byKey(const Key('training-agenda-row-p1')), findsOneWidget);
      expect(
        find.byKey(const Key('training-agenda-row-k1_2026-10-23')),
        findsOneWidget,
      );
      expect(find.text('LOCAL DIFERENTE NESTA AULA'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('training-origin-arena')));
      expect(find.byKey(const Key('training-agenda-row-s1')), findsOneWidget);
      expect(find.byKey(const Key('training-agenda-row-p1')), findsNothing);

      await _tap(tester, find.byKey(const Key('training-origin-all')));
      await _tap(
        tester,
        find.byKey(const Key('training-agenda-day-2026-10-24')),
      );
      expect(find.byKey(const Key('training-agenda-row-p1')), findsOneWidget);
      expect(find.byKey(const Key('training-agenda-row-s1')), findsNothing);

      // Semana seguinte: só a aula do centro em outro local (seg 26) cabe na
      // primeira; na segunda semana não há nada.
      await _tap(tester, find.byKey(const Key('training-agenda-next')));
      expect(find.byKey(const Key('training-agenda-empty')), findsOneWidget);
    });
  });

  group('O6 · centro de treinamento', () {
    testWidgets('programa, locais e plano com a fatura em aberto', (
      tester,
    ) async {
      final router = await _pump(tester, location: '/treinos/centro/ct1');
      expect(find.text('CT Areia Alta'), findsOneWidget);
      expect(find.text('MATRÍCULA ATIVA · DESDE AGO 2026'), findsOneWidget);
      expect(find.byKey(const Key('training-center-presence')), findsOneWidget);
      expect(find.byKey(const Key('training-center-makeup')), findsOneWidget);
      expect(
        find.byKey(const Key('training-center-row-k1_2026-10-23')),
        findsOneWidget,
      );

      await _tap(tester, find.text('Locais'));
      expect(
        find.byKey(const Key('training-center-place-Sede Barra')),
        findsOneWidget,
      );
      expect(find.text('SEG 26 · SÓ NESTA AULA'), findsOneWidget);

      await _tap(tester, find.text('Plano'));
      expect(find.byKey(const Key('training-center-plan-e1')), findsOneWidget);
      expect(
        find.byKey(const Key('training-center-invoice-i1')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('training-center-pay-i1')), findsOneWidget);
      expect(find.byKey(const Key('training-center-paid-i0')), findsOneWidget);

      await _tap(tester, find.text('Programa'));
      await _tap(
        tester,
        find.byKey(const Key('training-center-row-k1_2026-10-23')),
      );
      expect(router.state.uri.path, '/treinos/centro/ct1/aula/k1_2026-10-23');
    });

    testWidgets('carteirinha do check-in', (tester) async {
      await _pump(tester, location: '/treinos/centro/ct1');
      await _tap(tester, find.byKey(const Key('training-center-card')));
      expect(find.byKey(const Key('training-center-card-sheet')), findsOneWidget);
    });

    testWidgets('contrato para assinar em destaque no centro', (tester) async {
      final raw = centerResponse();
      final center = (raw['centers'] as List).first as Map<String, Object?>;
      center['contracts'] = [contractJson()];
      await _pump(
        tester,
        location: '/treinos/centro/ct1',
        repo: _FakeCenters(
          data: MyTrainingCentersData(
            centers: trainingCentersFromResponse(raw),
          ),
        ),
      );
      expect(
        find.byKey(const Key('training-center-contract-pending')),
        findsOneWidget,
      );
      expect(find.text('Contrato de matrícula'), findsOneWidget);
      expect(find.text('Ler e assinar'), findsOneWidget);
    });

    testWidgets('push de fatura abre direto no Plano', (tester) async {
      await _pump(tester, location: '/treinos/centro/ct1?aba=plano');
      expect(
        find.byKey(const Key('training-center-invoice-i1')),
        findsOneWidget,
      );
    });

    testWidgets('sem vínculo com o centro', (tester) async {
      await _pump(tester, location: '/treinos/centro/outro');
      expect(find.byKey(const Key('training-center-missing')), findsOneWidget);
    });
  });

  group('O7 · aula do centro', () {
    testWidgets('local mudou só nesta aula', (tester) async {
      await _pump(tester, location: '/treinos/centro/ct1/aula/k1_2026-10-26');
      expect(
        find.byKey(const Key('training-center-session-moved')),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'De Sede Barra para Praia do Leme. Físico na areia.',
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('training-center-session-maps')),
        findsOneWidget,
      );
      expect(find.text('SEG 26 · 07:00 – 08:30'), findsOneWidget);
      expect(find.textContaining('Até 6h antes'), findsOneWidget);
    });

    testWidgets('aula que não está mais na agenda', (tester) async {
      await _pump(tester, location: '/treinos/centro/ct1/aula/x');
      expect(
        find.byKey(const Key('training-center-session-missing')),
        findsOneWidget,
      );
    });
  });

  group('O4/O5 · particular e turma de arena', () {
    testWidgets('turma na arena: próxima aula e regras da arena', (
      tester,
    ) async {
      await _pump(tester, location: '/treinos/arena/ae1');
      expect(find.text('Arena CFC'), findsOneWidget);
      expect(find.byKey(const Key('training-arena-row-s1')), findsOneWidget);
      expect(find.byKey(const Key('training-arena-rules')), findsOneWidget);
      expect(find.text('Até 4h antes gera reposição'), findsOneWidget);
      expect(find.byKey(const Key('training-arena-use-credit')), findsNothing);
    });

    testWidgets('professor particular: aula, plano e agendar', (tester) async {
      final router = await _pump(tester, location: '/treinos/particular/tm');
      expect(find.text('Thiago Mendes'), findsOneWidget);
      expect(find.byKey(const Key('training-private-row-p1')), findsOneWidget);
      expect(
        find.text('PACOTE 8 AULAS · COBRADO PELO PROFESSOR'),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('training-private-book')));
      expect(router.state.uri.path, '/particulares/agendar/tm');
    });
  });

  group('O8 · pagamentos por origem', () {
    testWidgets('centro entra com a matrícula, a fatura e o pagamento', (
      tester,
    ) async {
      await _pump(tester, location: AppRoutes.athleteTrainingPlans);
      expect(find.text('3 ATIVOS · 1 EM ABERTO'), findsOneWidget);
      expect(
        find.byKey(const Key('training-plans-center-open-i1')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('training-plan-center-e1')), findsOneWidget);
      expect(find.byKey(const Key('training-plan-arena-ae1')), findsOneWidget);
      expect(
        find.byKey(const Key('training-plan-professor-tm')),
        findsOneWidget,
      );
      expect(find.text('Outubro'), findsOneWidget);
    });
  });

  group('O7 · presença na aula do centro', () {
    testWidgets('confirmar presença chama o servidor', (tester) async {
      final repo = _FakeCenters(
        data: MyTrainingCentersData(
          centers: trainingCentersFromResponse(centerResponse()),
        ),
      );
      await _pump(
        tester,
        location: '/treinos/centro/ct1/aula/k1_2026-10-23',
        repo: repo,
      );
      await _tap(tester, find.byKey(const Key('center-presence-going-button')));
      expect(repo.calls, ['respond k1_2026-10-23 going']);
      expect(find.text('Presença confirmada.'), findsOneWidget);
    });

    testWidgets('não vou: a folha explica a reposição e avisa', (tester) async {
      final repo = _FakeCenters(
        data: MyTrainingCentersData(
          centers: trainingCentersFromResponse(centerResponse()),
        ),
      );
      await _pump(
        tester,
        location: '/treinos/centro/ct1/aula/k1_2026-10-26',
        repo: repo,
      );
      await _tap(
        tester,
        find.byKey(const Key('center-presence-not-going-button')),
      );
      expect(find.byKey(const Key('center-not-going-sheet')), findsOneWidget);
      expect(find.textContaining('vira um crédito'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-not-going-confirm')));
      expect(repo.calls, ['respond k1_2026-10-26 not_going']);
      expect(find.textContaining('Falta avisada'), findsOneWidget);
    });

    testWidgets('resposta já dada mostra o estado e deixa trocar', (
      tester,
    ) async {
      final raw = centerResponse();
      final sessions =
          ((raw['centers'] as List).first as Map)['sessions'] as List;
      (sessions[1] as Map)['myRsvp'] = 'going';
      await _pump(
        tester,
        location: '/treinos/centro/ct1/aula/k1_2026-10-23',
        repo: _FakeCenters(
          data: MyTrainingCentersData(
            centers: trainingCentersFromResponse(raw),
          ),
        ),
      );
      expect(find.byKey(const Key('center-presence-going')), findsOneWidget);
      expect(find.text('Não vou mais'), findsOneWidget);
    });
  });

  group('F2/F3 · fatura do centro no app', () {
    testWidgets('Pix com QR e copia-e-cola; verificar sem confirmação', (
      tester,
    ) async {
      final repo = _FakeCenters(
        data: MyTrainingCentersData(
          centers: trainingCentersFromResponse(centerResponse()),
        ),
      );
      await _pump(
        tester,
        location: '/treinos/centro/ct1/fatura/i1',
        repo: repo,
      );
      expect(find.byKey(const Key('center-invoice-summary')), findsOneWidget);
      expect(find.byKey(const Key('center-invoice-pix')), findsOneWidget);
      expect(find.text('Copiar código Pix'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-invoice-check')));
      expect(repo.calls, ['pix i1', 'check i1']);
      expect(find.byKey(const Key('center-invoice-not-yet')), findsOneWidget);

      await _tap(tester, find.text('Cartão'));
      expect(find.byKey(const Key('center-invoice-open-card')), findsOneWidget);
    });

    testWidgets('verificado e pago: tela de paga', (tester) async {
      final repo = _FakeCenters(
        data: MyTrainingCentersData(
          centers: trainingCentersFromResponse(centerResponse()),
        ),
      )..checkStatus = 'approved';
      await _pump(
        tester,
        location: '/treinos/centro/ct1/fatura/i1',
        repo: repo,
      );
      await _tap(tester, find.byKey(const Key('center-invoice-check')));
      expect(find.byKey(const Key('center-invoice-paid')), findsOneWidget);
    });

    testWidgets('fatura já paga abre direto como paga', (tester) async {
      await _pump(tester, location: '/treinos/centro/ct1/fatura/i0');
      expect(find.byKey(const Key('center-invoice-paid')), findsOneWidget);
      expect(find.byKey(const Key('center-invoice-check')), findsNothing);
    });

    testWidgets('o botão Pagar do centro abre a fatura no app', (tester) async {
      final router = await _pump(
        tester,
        location: '/treinos/centro/ct1?aba=plano',
      );
      await _tap(tester, find.byKey(const Key('training-center-pay-i1')));
      expect(router.state.uri.path, '/treinos/centro/ct1/fatura/i1');
    });
  });

  group('O3 · convite do centro', () {
    testWidgets('convite no hub e na tela Adicionar; aceitar abre o centro', (
      tester,
    ) async {
      final repo = _FakeCenters(
        data: MyTrainingCentersData(
          centers: trainingCentersFromResponse(centerResponse()),
          invites: const [_invite],
        ),
      );
      final router = await _pump(
        tester,
        location: AppRoutes.athleteTrainings,
        repo: repo,
      );
      expect(find.byKey(const Key('training-hub-invite-inv1')), findsOneWidget);

      await _tap(tester, find.byKey(const Key('training-hub-add')));
      expect(router.state.uri.path, '/treinos/adicionar');
      expect(find.byKey(const Key('center-invite-inv1')), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('center-invite-inv1')),
          matching: find.textContaining('Sub-17 Feminino'),
        ),
        findsOneWidget,
      );

      await _tap(
        tester,
        // O hub (rota de baixo) tem o mesmo cartão: toca o da tela de cima.
        find.byKey(const Key('center-invite-accept-inv1')).last,
      );
      expect(repo.calls, ['invite inv1 true']);
      expect(router.state.uri.path, '/treinos/centro/ct2');
    });

    testWidgets('tenho um código: erro e depois entra no centro', (
      tester,
    ) async {
      final repo = _FakeCenters(data: const MyTrainingCentersData());
      final router = await _pump(
        tester,
        location: '/treinos/adicionar',
        repo: repo,
      );
      await _tap(tester, find.byKey(const Key('training-add-code-toggle')));
      await tester.enterText(
        find.byKey(const Key('training-add-code-field')),
        'AAA-BBB',
      );
      await _tap(tester, find.byKey(const Key('training-add-code-join')));
      expect(find.text('Código não encontrado.'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('training-add-code-field')),
        'XK7-Q2M',
      );
      await _tap(tester, find.byKey(const Key('training-add-code-join')));
      expect(repo.calls, ['join AAA-BBB', 'join XK7-Q2M']);
      expect(router.state.uri.path, '/treinos/centro/ct1');
    });

    testWidgets('e-mail não confirmado: só o aviso', (tester) async {
      await _pump(
        tester,
        location: '/treinos/adicionar',
        repo: _FakeCenters(
          data: const MyTrainingCentersData(unverifiedInvites: 1),
        ),
      );
      expect(find.byKey(const Key('center-invite-unverified')), findsOneWidget);
      await _tap(tester, find.byKey(const Key('training-add-private')));
      expect(find.text('encontrar'), findsOneWidget);
    });
  });
}
