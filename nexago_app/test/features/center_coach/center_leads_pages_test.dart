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
import 'package:nexago_app/features/center_coach/domain/center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/domain/center_leads.dart';
import 'package:nexago_app/features/center_coach/domain/center_leads_repository.dart';
import 'package:nexago_app/features/center_coach/domain/center_management.dart';
import 'package:nexago_app/features/center_coach/domain/center_management_repository.dart';
import 'package:nexago_app/features/center_coach/infrastructure/center_selection_store.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_leads_repository.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_management_repository.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_call_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_leads_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_new_lead_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_student_page.dart'
    show centerContactLauncherProvider;
import 'package:nexago_app/features/center_coach/presentation/center_coach_trial_review_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_links_ui.dart';

// Sáb 24/10/2026 10:00 em São Paulo.
final _now = DateTime.utc(2026, 10, 24, 13);

const _classes = [
  CenterCoachClass(
    id: 'k1',
    name: 'BT Iniciante A',
    programId: 'bt',
    coachUid: 'tm',
    coachName: 'Thiago Mendes',
    weekdays: [1, 3],
    startTime: '07:00',
    capacity: 4,
    seatsTaken: 2,
    rosterStudentIds: ['s1', 's2'],
  ),
  CenterCoachClass(
    id: 'k2',
    name: 'BT Intermediário B',
    programId: 'bt',
    coachUid: 'tm',
    coachName: 'Thiago Mendes',
    weekdays: [2, 4],
    startTime: '19:00',
    capacity: 6,
    seatsTaken: 5,
  ),
];

CenterCoachSession _session(
  String id, {
  String classId = 'k1',
  String date = '2026-10-26',
  String start = '07:00',
  String coachUid = 'tm',
  Map<String, Object?> trials = const {},
}) =>
    CenterCoachSession.fromMap(id, {
      'classId': classId,
      'className': classId == 'k1' ? 'BT Iniciante A' : 'BT Intermediário B',
      'date': date,
      'startTime': start,
      'durationMin': 60,
      'coachUid': coachUid,
      'coachName': 'Thiago Mendes',
      'status': 'scheduled',
      'trials': trials,
    });

class _Coach implements CenterCoachRepository {
  _Coach({required this.role, this.sessions = const []});

  final String role;
  List<CenterCoachSession> sessions;

  @override
  Stream<List<CenterMembership>> watchMemberships(String uid) => Stream.value([
        CenterMembership.fromMap('c1', {
          'centerName': 'CT Maré Alta',
          'role': role,
          'status': 'active',
          'displayName': 'Camila Neves',
        }),
      ]);

  @override
  Stream<CenterCoachCenter?> watchCenter(String centerId) => Stream.value(
        const CenterCoachCenter(id: 'c1', name: 'CT Maré Alta'),
      );

  @override
  Stream<List<CenterCoachSession>> watchSessions(
    String centerId, {
    required String fromKey,
    required String toKey,
  }) =>
      Stream.value(sessions);

  @override
  Stream<CenterCoachSession?> watchSession(String centerId, String id) =>
      Stream.value(sessions.where((s) => s.id == id).firstOrNull);

  @override
  Stream<List<CenterCoachClass>> watchClasses(String centerId) =>
      Stream.value(_classes);

  @override
  Stream<List<CenterCoachStudent>> watchStudents(
    String centerId, {
    required String uid,
    required bool all,
  }) =>
      Stream.value(const []);

  @override
  Stream<List<CenterCoachEnrollment>> watchEnrollments(String centerId) =>
      Stream.value(const []);

  @override
  Stream<List<CenterAuditEntry>> watchAuditLogs(
    String centerId, {
    int limit = 100,
  }) =>
      Stream.value(const []);

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

class _Mgmt implements CenterManagementRepository {
  @override
  Stream<List<CenterProgram>> watchPrograms(String centerId) => Stream.value(
        const [
          CenterProgram(id: 'bt', name: 'Beach Tennis'),
          CenterProgram(id: 'volei', name: 'Vôlei', order: 1),
        ],
      );

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

class _Leads implements CenterLeadsRepository {
  _Leads({this.leads = const []});

  List<CenterLead> leads;
  CenterLeadSettings settings = const CenterLeadSettings();
  final created = <CenterNewLeadInput>[];
  final stages = <(String, String, String?)>[];
  final scheduled = <(String, String)>[];
  final evaluated = <Map<String, Object?>>[];

  @override
  Stream<List<CenterLead>> watchLeads(String centerId) => Stream.value(leads);

  @override
  Stream<CenterLeadSettings> watchSettings(String centerId) =>
      Stream.value(settings);

  @override
  Future<String> createLead({
    required String centerId,
    required CenterNewLeadInput input,
    required CenterActor actor,
  }) async {
    created.add(input);
    return 'new1';
  }

  @override
  Future<void> setStage({
    required String centerId,
    required CenterLead lead,
    required String stage,
    String? lostReason,
    required CenterActor actor,
  }) async =>
      stages.add((lead.id, stage, lostReason));

  @override
  Future<String> scheduleTrial({
    required String centerId,
    required String leadId,
    required String sessionId,
  }) async {
    scheduled.add((leadId, sessionId));
    return 'b1';
  }

  @override
  Future<void> evaluateTrial({
    required String centerId,
    required String bookingId,
    required bool attended,
    String? level,
    String? classId,
    String note = '',
  }) async =>
      evaluated.add({
        'bookingId': bookingId,
        'attended': attended,
        'level': level,
        'classId': classId,
        'note': note,
      });
}

class _Store implements CenterSelectionStore {
  @override
  Future<String?> load(String uid) async => 'c1';

  @override
  Future<void> save(String uid, String centerId) async {}
}

final _launched = <Uri>[];

Future<void> _pump(
  WidgetTester tester,
  String location, {
  String role = 'receptionist',
  String uid = 'cn',
  _Leads? leads,
  List<CenterCoachSession> sessions = const [],
}) async {
  tester.view.physicalSize = const Size(420, 1800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  _launched.clear();
  String p(GoRouterState s, String k) => s.pathParameters[k] ?? '';
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: AppRoutes.centerCoachAgenda,
        name: AppRouteNames.centerCoachAgenda,
        builder: (_, __) => const Scaffold(body: Text('agenda')),
      ),
      GoRoute(
        path: AppRoutes.centerCoachNewLead,
        name: AppRouteNames.centerCoachNewLead,
        builder: (_, s) => CenterCoachNewLeadPage(centerId: p(s, 'centerId')),
      ),
      GoRoute(
        path: AppRoutes.centerCoachLeads,
        name: AppRouteNames.centerCoachLeads,
        builder: (_, s) => CenterCoachLeadsPage(centerId: p(s, 'centerId')),
      ),
      GoRoute(
        path: AppRoutes.centerCoachSession,
        name: AppRouteNames.centerCoachSession,
        builder: (_, s) => CenterCoachCallPage(
          centerId: p(s, 'centerId'),
          sessionId: p(s, 'sessionId'),
        ),
      ),
      GoRoute(
        path: AppRoutes.centerCoachTrialReview,
        name: AppRouteNames.centerCoachTrialReview,
        builder: (_, s) => CenterCoachTrialReviewPage(
          centerId: p(s, 'centerId'),
          sessionId: p(s, 'sessionId'),
          trialKey: p(s, 'trialKey'),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue(uid),
        professorLinksClockProvider.overrideWithValue(() => _now),
        centerCoachRepositoryProvider.overrideWithValue(
          _Coach(role: role, sessions: sessions),
        ),
        centerManagementRepositoryProvider.overrideWithValue(_Mgmt()),
        centerLeadsRepositoryProvider.overrideWithValue(leads ?? _Leads()),
        centerSelectionStoreProvider.overrideWithValue(_Store()),
        centerContactLauncherProvider.overrideWithValue((uri) async {
          _launched.add(uri);
          return true;
        }),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await _settle(tester);
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

CenterLead _lead(
  String id,
  String name, {
  String stage = 'new',
  Duration age = const Duration(minutes: 18),
  Map<String, Object?> extra = const {},
}) =>
    CenterLead.fromMap(id, {
      'name': name,
      'phone': '(21) 99604-1182',
      'source': 'instagram',
      'interest': {
        'programId': 'bt',
        'programName': 'Beach Tennis',
        'period': 'morning',
      },
      'stage': stage,
      'createdAt': _now.subtract(age),
      'updatedAt': _now.subtract(age),
      ...extra,
    });

const _leadsPath = '/athlete/professor/centros/c1/captacao';
const _newLeadPath = '/athlete/professor/centros/c1/captacao/novo';

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  group('C6 · captação', () {
    _Leads board() => _Leads(
          leads: [
            _lead('mc', 'Mariana Couto'),
            _lead('rp', 'Rodrigo Paes', age: const Duration(hours: 3)),
            _lead(
              'lp',
              'Lara Pinheiro',
              stage: 'scheduled',
              extra: {
                'trial': {
                  'date': '2026-10-24',
                  'startTime': '19:00',
                  'className': 'BT Intermediário B',
                  'coachName': 'Thiago Mendes',
                  'status': 'confirmed',
                },
              },
            ),
            _lead('gr', 'Gustavo Reis', stage: 'attended'),
            _lead('ww', 'Wesley Won', stage: 'won'),
          ],
        );

    testWidgets('grupos, números, atrasado e WhatsApp da linha', (
      tester,
    ) async {
      await _pump(tester, _leadsPath, leads: board());
      expect(find.text('Captação'), findsOneWidget);
      expect(
        find.text('OUT · 5 INTERESSADOS · 1 MATRICULADO'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('center-leads-group-respond')), findsOne);
      expect(find.byKey(const Key('center-leads-group-today')), findsOne);
      expect(find.byKey(const Key('center-leads-group-attended')), findsOne);
      expect(
          find.byKey(const Key('center-leads-group-scheduled')), findsNothing);
      expect(find.byKey(const Key('center-lead-late-rp')), findsOneWidget);
      expect(find.byKey(const Key('center-lead-late-mc')), findsNothing);
      // Matriculado não aparece na lista.
      expect(find.byKey(const Key('center-lead-ww')), findsNothing);
      // Conversão: 1 matriculado ÷ (1 + 1 fez experimental).
      expect(
        find.descendant(
          of: find.byKey(const Key('center-leads-stat-conversion')),
          matching: find.text('50%'),
        ),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('center-lead-wa-mc')));
      expect(_launched.single.toString(), 'https://wa.me/5521996041182');
    });

    testWidgets('vazio e sem permissão', (tester) async {
      await _pump(tester, _leadsPath);
      expect(find.byKey(const Key('center-leads-empty')), findsOneWidget);
      await _pump(tester, _leadsPath, role: 'coach');
      expect(find.byKey(const Key('center-leads-denied')), findsOneWidget);
      expect(find.byKey(const Key('center-leads-add')), findsNothing);
    });

    testWidgets('marcar em contato e perdido pelo sheet de ações', (
      tester,
    ) async {
      final leads = board();
      await _pump(tester, _leadsPath, leads: leads);
      await _tap(tester, find.byKey(const Key('center-lead-mc')));
      expect(find.byKey(const Key('center-lead-actions')), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-lead-action-contacted')));
      expect(leads.stages.single, ('mc', 'contacted', null));

      await _tap(tester, find.byKey(const Key('center-lead-rp')));
      await _tap(tester, find.byKey(const Key('center-lead-action-lost')));
      expect(
        tester
            .widget<ProfessorLinksPrimaryButton>(
              find.byKey(const Key('center-lead-lost-confirm')),
            )
            .onPressed,
        isNull,
      );
      await _tap(tester, find.byKey(const Key('center-lead-lost-price')));
      await _tap(tester, find.byKey(const Key('center-lead-lost-confirm')));
      expect(leads.stages.last, ('rp', 'lost', 'price'));
    });

    testWidgets('agendar experimental: limite, confirmar e WhatsApp', (
      tester,
    ) async {
      final leads = board();
      await _pump(
        tester,
        _leadsPath,
        leads: leads,
        sessions: [
          _session('free'),
          _session(
            'full',
            date: '2026-10-28',
            trials: {
              'u1': {'name': 'A', 'status': 'confirmed'},
              'u2': {'name': 'B', 'status': 'confirmed'},
            },
          ),
          // Noite: fora do período do interessado (manhã).
          _session('night', classId: 'k2', start: '19:00'),
        ],
      );
      await _tap(tester, find.byKey(const Key('center-lead-mc')));
      await _tap(tester, find.byKey(const Key('center-lead-action-schedule')));
      expect(find.byKey(const Key('center-trial-sheet')), findsOneWidget);
      expect(find.byKey(const Key('center-trial-slot-night')), findsNothing);
      expect(
        find.textContaining('Limite de experimentais atingido'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<ProfessorLinksPrimaryButton>(
              find.byKey(const Key('center-trial-confirm')),
            )
            .onPressed,
        isNull,
      );
      // Tirar o filtro de período mostra a aula da noite.
      await _tap(tester, find.byKey(const Key('center-trial-filter-period')));
      expect(find.byKey(const Key('center-trial-slot-night')), findsOneWidget);

      await _tap(tester, find.byKey(const Key('center-trial-slot-free')));
      await _tap(tester, find.byKey(const Key('center-trial-confirm')));
      expect(leads.scheduled.single, ('mc', 'free'));
      expect(find.byKey(const Key('center-trial-booked')), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-trial-whatsapp')));
      expect(
        _launched.single.queryParameters['text'],
        'Olá, Mariana! Sua aula experimental no CT Maré Alta ficou para '
        'seg 26/10 às 07:00 · BT Iniciante A com Thiago Mendes.',
      );
      expect(find.byKey(const Key('center-trial-booked')), findsNothing);
    });

    testWidgets('o + abre o cadastro', (tester) async {
      await _pump(tester, _leadsPath, leads: board());
      await _tap(tester, find.byKey(const Key('center-leads-add')));
      expect(find.text('Novo interessado'), findsOneWidget);
    });
  });

  group('C7 · novo interessado', () {
    testWidgets('valida nome e WhatsApp e só salva', (tester) async {
      final leads = _Leads();
      await _pump(tester, _newLeadPath, leads: leads);
      expect(find.text('CADASTRO NO BALCÃO'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-new-lead-save')));
      expect(find.byKey(const Key('center-new-lead-problem')), findsOneWidget);
      expect(leads.created, isEmpty);

      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('center-new-lead-name')),
          matching: find.byType(TextField),
        ),
        'Beatriz Lemos',
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('center-new-lead-phone')),
          matching: find.byType(TextField),
        ),
        '(21) 9960-41',
      );
      await _settle(tester);
      expect(
        find.text('Informe um WhatsApp com DDD (10 ou 11 dígitos).'),
        findsOneWidget,
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('center-new-lead-phone')),
          matching: find.byType(TextField),
        ),
        '(21) 99604-1182',
      );
      await _tap(tester, find.byKey(const Key('center-new-lead-program-bt')));
      await _tap(
        tester,
        find.byKey(const Key('center-new-lead-experience-plays')),
      );
      await _tap(
          tester, find.byKey(const Key('center-new-lead-period-morning')));
      await _tap(
        tester,
        find.byKey(const Key('center-new-lead-source-instagram')),
      );
      await _tap(tester, find.byKey(const Key('center-new-lead-save')));
      final input = leads.created.single;
      expect(
        (
          input.name,
          input.programId,
          input.programName,
          input.experience,
          input.period,
          input.source,
        ),
        (
          'Beatriz Lemos',
          'bt',
          'Beach Tennis',
          'plays',
          'morning',
          'instagram'
        ),
      );
      // Sem pilha, cai na Captação.
      expect(find.text('Captação'), findsOneWidget);
    });

    testWidgets('salvar e agendar abre o sheet de horários', (tester) async {
      final leads = _Leads();
      await _pump(
        tester,
        _newLeadPath,
        leads: leads,
        sessions: [_session('free')],
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('center-new-lead-name')),
          matching: find.byType(TextField),
        ),
        'Beatriz Lemos',
      );
      await tester.enterText(
        find.descendant(
          of: find.byKey(const Key('center-new-lead-phone')),
          matching: find.byType(TextField),
        ),
        '21996041182',
      );
      await _settle(tester);
      expect(
        find.byKey(const Key('center-new-lead-source-desk')),
        findsOneWidget,
      );
      await _tap(
        tester,
        find.byKey(const Key('center-new-lead-save-schedule')),
      );
      expect(leads.created.single.source, 'desk');
      expect(find.byKey(const Key('center-trial-sheet')), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-trial-slot-free')));
      await _tap(tester, find.byKey(const Key('center-trial-confirm')));
      expect(leads.scheduled.single, ('new1', 'free'));
      await _tap(tester, find.byKey(const Key('center-trial-close')));
      expect(find.text('Captação'), findsOneWidget);
    });
  });

  group('C8 · avaliar experimental', () {
    final trialSession = _session(
      'k1_d',
      date: '2026-10-24',
      start: '07:00',
      trials: {
        'l_gr': {
          'bookingId': 'k1_d_l_gr',
          'name': 'Gustavo Reis',
          'status': 'confirmed',
          'leadId': 'gr',
          'experience': 'plays',
          'goal': 'quer competir',
        },
        'uApp': {'name': 'Pedido App', 'status': 'pending'},
      },
    );

    testWidgets('da chamada para a avaliação e envio', (tester) async {
      final leads = _Leads();
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_d',
        role: 'coach',
        uid: 'tm',
        leads: leads,
        sessions: [trialSession],
      );
      await tester.scrollUntilVisible(
        find.byKey(const Key('center-coach-trial-l_gr')),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Experimental · avaliar'), findsOneWidget);
      // Pedido pendente do app não abre avaliação.
      expect(
        find.text('Experimental · o centro ainda vai confirmar'),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('center-coach-trial-l_gr')));
      expect(find.text('Aula experimental'), findsOneWidget);
      expect(find.text('BT INICIANTE A · HOJE 07:00'), findsOneWidget);
      expect(find.text('Já joga · quer competir'), findsOneWidget);
      expect(
        find.text(
          'Gustavo não vê esta avaliação. Ela vai para a recepção montar a '
          'proposta.',
        ),
        findsOneWidget,
      );
      VoidCallback? send() => tester
          .widget<ProfessorLinksPrimaryButton>(
            find.byKey(const Key('center-trial-review-send')),
          )
          .onPressed;
      expect(send(), isNull);
      await _tap(tester, find.byKey(const ValueKey('center-seg-yes')));
      // Veio pede o nível.
      expect(send(), isNull);
      await _tap(
        tester,
        find.byKey(const Key('center-trial-review-level-intermediate')),
      );
      await _tap(
        tester,
        find.byKey(const Key('center-trial-review-class-k2')),
      );
      expect(find.textContaining('1 vaga'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('center-trial-review-note')),
        'Boa base de fundo de quadra.',
      );
      await _tap(tester, find.byKey(const Key('center-trial-review-send')));
      expect(leads.evaluated.single, {
        'bookingId': 'k1_d_l_gr',
        'attended': true,
        'level': 'intermediate',
        'classId': 'k2',
        'note': 'Boa base de fundo de quadra.',
      });
    });

    testWidgets('não veio manda só a presença; já avaliada reenvia', (
      tester,
    ) async {
      final leads = _Leads();
      final evaluated = _session(
        'k1_d',
        date: '2026-10-23',
        trials: {
          'l_gr': {
            'bookingId': 'k1_d_l_gr',
            'name': 'Gustavo Reis',
            'status': 'confirmed',
            'attendance': 'no_show',
            'evaluated': true,
          },
        },
      );
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_d/experimental/l_gr',
        role: 'coach',
        uid: 'tm',
        leads: leads,
        sessions: [evaluated],
      );
      expect(find.text('BT INICIANTE A · ONTEM 07:00'), findsOneWidget);
      expect(
        find.byKey(const Key('center-trial-review-evaluated')),
        findsOneWidget,
      );
      expect(find.text('Reenviar avaliação'), findsOneWidget);
      expect(find.text('Não veio'), findsWidgets);
      expect(find.byKey(const Key('center-trial-review-level-beginner')),
          findsNothing);
      await _tap(tester, find.byKey(const Key('center-trial-review-send')));
      expect(leads.evaluated.single['attended'], isFalse);
      expect(leads.evaluated.single['level'], isNull);
    });

    testWidgets('professor de outra aula não avalia', (tester) async {
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_d/experimental/l_gr',
        role: 'coach',
        uid: 'outro',
        sessions: [trialSession],
      );
      expect(
        find.byKey(const Key('center-trial-review-denied')),
        findsOneWidget,
      );
    });
  });
}
