import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/center_coach/application/center_coach_providers.dart';
import 'package:nexago_app/features/center_coach/application/center_management_providers.dart';
import 'package:nexago_app/features/center_coach/domain/center_alerts.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/domain/center_management.dart';
import 'package:nexago_app/features/center_coach/domain/center_management_repository.dart';
import 'package:nexago_app/features/center_coach/infrastructure/center_selection_store.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_coach_repository.dart';
import 'package:nexago_app/features/center_coach/infrastructure/firebase_center_management_repository.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_agenda_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_call_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_classes_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_enroll_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_invoice_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_new_student_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_subscription_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_team_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_coach_today_page.dart';
import 'package:nexago_app/features/center_coach/presentation/center_mode_shell_page.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_links_ui.dart';

// Sex 23/10/2026 12:00 em São Paulo.
final _fri = DateTime.utc(2026, 10, 23, 15);

// Ter 20/10/2026 12:00 em São Paulo (matrícula proporcional).
final _tue = DateTime.utc(2026, 10, 20, 15);

const _students = [
  CenterCoachStudent(id: 's1', name: 'Marina Teles'),
  CenterCoachStudent(id: 's2', name: 'Caio Ramos'),
  CenterCoachStudent(id: 's3', name: 'Elisa Prado'),
];

const _classes = [
  // Lotada.
  CenterCoachClass(
    id: 'k1',
    name: 'BT Intermediário B',
    programId: 'bt',
    level: 'Intermediário',
    coachUid: 'tm',
    coachName: 'Thiago Mendes',
    weekdays: [2, 4],
    startTime: '19:00',
    capacity: 6,
    seatsTaken: 6,
  ),
  // Mesmo nível e modalidade, com vaga: alternativa.
  CenterCoachClass(
    id: 'k2',
    name: 'BT Intermediário Sábado',
    programId: 'bt',
    level: 'Intermediário',
    coachUid: 'paula',
    coachName: 'Paula Lima',
    weekdays: [6],
    startTime: '09:00',
    capacity: 8,
    seatsTaken: 5,
  ),
  // Outro nível: nunca é alternativa.
  CenterCoachClass(
    id: 'k3',
    name: 'BT Iniciante',
    programId: 'bt',
    level: 'Iniciante',
    weekdays: [3],
    startTime: '18:00',
    capacity: 8,
    seatsTaken: 2,
  ),
  CenterCoachClass(
    id: 'v1',
    name: 'Vôlei Avançado',
    programId: 'volei',
    level: 'Avançado',
    weekdays: [1],
    startTime: '20:00',
    capacity: 10,
    seatsTaken: 1,
  ),
];

CenterCoachSession _session(
  String id, {
  String date = '2026-10-24',
  String start = '19:00',
  String coachUid = 'tm',
  Map<String, Object?> extra = const {},
}) =>
    CenterCoachSession.fromMap(id, {
      'classId': 'k1',
      'className': 'BT Intermediário B',
      'date': date,
      'startTime': start,
      'durationMin': 60,
      'coachUid': coachUid,
      'coachName': 'Thiago',
      'locationId': 'l1',
      'locationName': 'Sede Barra',
      'courtId': 'q2',
      'courtName': 'Quadra 2',
      'status': 'scheduled',
      ...extra,
    });

/// Leituras do professor/centro: só o que as telas da gestão observam.
class _Coach implements CenterCoachRepository {
  _Coach({
    required this.memberships,
    this.sessions = const [],
    this.enrollments = const [],
    this.invoices = const [],
  });

  List<CenterMembership> memberships;
  List<CenterCoachSession> sessions;
  List<CenterCoachStudent> students = _students;
  List<CenterCoachClass> classes = _classes;
  List<CenterCoachEnrollment> enrollments;
  List<CenterCoachInvoice> invoices;

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
  }) =>
      Stream.value(sessions);

  @override
  Stream<CenterCoachSession?> watchSession(String centerId, String sessionId) =>
      Stream.value(sessions.where((s) => s.id == sessionId).firstOrNull);

  @override
  Stream<List<CenterCoachSession>> watchClassSessions(
    String centerId,
    String classId, {
    required String fromKey,
    required String toKey,
  }) =>
      Stream.value([
        for (final s in sessions)
          if (s.classId == classId) s,
      ]);

  @override
  Stream<List<CenterCoachClass>> watchClasses(String centerId) =>
      Stream.value(classes);

  @override
  Stream<List<CenterCoachStudent>> watchStudents(
    String centerId, {
    required String uid,
    required bool all,
  }) =>
      Stream.value(students);

  @override
  Stream<List<CenterCoachEnrollment>> watchEnrollments(String centerId) =>
      Stream.value(enrollments);

  @override
  Stream<List<CenterCoachInvoice>> watchInvoices(String centerId) =>
      Stream.value(invoices);

  @override
  Stream<Map<String, String>> watchPlanNames(String centerId) =>
      Stream.value(const {'p2': 'Mensal 2x', 'p8': 'Pacote 8'});

  @override
  Stream<List<CenterAuditEntry>> watchAuditLogs(
    String centerId, {
    int limit = 100,
  }) =>
      Stream.value(const []);

  @override
  Future<List<MakeupCandidate>> makeupCandidates(
    String centerId,
    String sessionId,
  ) async =>
      const [];

  // Escritas do professor não fazem parte destes cenários.
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

/// Gestão do centro: leituras configuráveis e cada escrita registrada.
class _Mgmt implements CenterManagementRepository {
  _Mgmt({
    this.team = const [],
    this.invites = const [],
    this.plans = const [],
    this.locations = const [],
    this.courts = const [],
    this.subscriptions = const [],
  });

  List<CenterTeamMember> team;
  List<CenterInvite> invites;
  List<CenterProgram> programs = const [
    CenterProgram(id: 'bt', name: 'Beach Tennis'),
    CenterProgram(id: 'volei', name: 'Vôlei'),
  ];
  List<CenterPlan> plans;
  List<CenterLocation> locations;
  List<CenterCourt> courts;
  List<CenterSubscription> subscriptions;

  CenterEnrollResult enrollResult = const CenterEnrolled(
    enrollmentId: 'e9',
    status: 'pending',
    invoiceId: 'inv9',
    amountCents: 16516,
  );
  String waitlistId = 'w9';
  CenterCoachException? failWith;

  final invited = <Map<String, Object?>>[];
  final cancelledInvites = <String>[];
  final revoked = <Map<String, Object?>>[];
  final enrolls = <Map<String, Object?>>[];
  final waitlists = <Map<String, Object?>>[];
  final moves = <Map<String, Object?>>[];
  final scheduledCancels = <String>[];
  final undos = <String>[];
  final charges = <String>[];
  final added = <CenterNewStudentInput>[];

  @override
  Future<String> addStudent({
    required String centerId,
    required CenterNewStudentInput input,
    required CenterActor actor,
  }) async {
    if (failWith != null) throw failWith!;
    added.add(input);
    return 'new1';
  }

  @override
  Stream<List<CenterTeamMember>> watchTeam(String centerId) =>
      Stream.value(team);

  @override
  Stream<List<CenterInvite>> watchInvites(String centerId) =>
      Stream.value(invites);

  @override
  Future<void> invite({
    required String centerId,
    required String centerName,
    required String email,
    required String displayName,
    required String role,
    required List<String> programIds,
    required List<String> classIds,
    required CenterActor actor,
  }) async {
    if (failWith != null) throw failWith!;
    invited.add({
      'centerId': centerId,
      'centerName': centerName,
      'email': email,
      'displayName': displayName,
      'role': role,
      'programIds': programIds,
      'classIds': classIds,
      'actor': actor.name,
    });
  }

  @override
  Future<void> cancelInvite({
    required String centerId,
    required CenterInvite invite,
    required CenterActor actor,
  }) async =>
      cancelledInvites.add(invite.id);

  @override
  Future<void> revokeMember({
    required String centerId,
    required CenterTeamMember member,
    required String reason,
    required CenterActor actor,
  }) async {
    if (failWith != null) throw failWith!;
    revoked.add({'uid': member.uid, 'reason': reason, 'actor': actor.uid});
  }

  @override
  Stream<List<CenterProgram>> watchPrograms(String centerId) =>
      Stream.value(programs);

  @override
  Stream<List<CenterPlan>> watchPlans(String centerId) => Stream.value(plans);

  @override
  Future<CenterEnrollResult> enroll({
    required String centerId,
    required CenterCoachCenter center,
    required CenterCoachStudent student,
    required CenterCoachClass cls,
    required CenterPlan plan,
    required String startDate,
    required String today,
    required bool canBill,
    required CenterActor actor,
  }) async {
    if (failWith != null) throw failWith!;
    enrolls.add({
      'student': student.id,
      'class': cls.id,
      'plan': plan.id,
      'startDate': startDate,
      'today': today,
      'canBill': canBill,
    });
    return enrollResult;
  }

  @override
  Future<String> joinWaitlist({
    required String centerId,
    required CenterCoachStudent student,
    required CenterCoachClass cls,
    required CenterPlan plan,
    required String startDate,
    required CenterActor actor,
  }) async {
    waitlists.add({'student': student.id, 'class': cls.id, 'plan': plan.id});
    return waitlistId;
  }

  @override
  Stream<List<CenterLocation>> watchLocations(String centerId) =>
      Stream.value(locations);

  @override
  Stream<List<CenterCourt>> watchCourts(String centerId) =>
      Stream.value(courts);

  @override
  Future<void> changeSessionLocation({
    required String centerId,
    required CenterCoachSession session,
    required CenterLocation location,
    CenterCourt? court,
    required String reason,
    required CenterActor actor,
  }) async {
    if (failWith != null) throw failWith!;
    moves.add({
      'session': session.id,
      'location': location.id,
      'court': court?.id,
      'reason': reason,
    });
  }

  @override
  Stream<List<CenterSubscription>> watchStudentSubscriptions(
    String centerId,
    String studentId,
  ) =>
      Stream.value([
        for (final s in subscriptions)
          if (s.studentId == studentId) s,
      ]);

  @override
  Future<void> scheduleSubscriptionCancel({
    required String centerId,
    required CenterSubscription subscription,
    required CenterActor actor,
  }) async {
    if (failWith != null) throw failWith!;
    scheduledCancels.add(subscription.id);
  }

  @override
  Future<void> undoSubscriptionCancel({
    required String centerId,
    required CenterSubscription subscription,
    required CenterActor actor,
  }) async =>
      undos.add(subscription.id);

  @override
  Future<({String invoiceId, String invoiceUrl, bool generated})> chargeNow({
    required String centerId,
    required CenterSubscription subscription,
  }) async {
    charges.add(subscription.id);
    return (invoiceId: 'i9', invoiceUrl: '', generated: true);
  }
}

class _MemoryCenterStore implements CenterSelectionStore {
  final Map<String, String> saved = {};

  @override
  Future<String?> load(String uid) async => saved[uid];

  @override
  Future<void> save(String uid, String centerId) async => saved[uid] = centerId;
}

CenterMembership _member({
  String role = 'center_owner',
  List<String> extraPerms = const [],
}) =>
    CenterMembership.fromMap('c1', {
      'centerName': 'CT Maré Alta',
      'role': role,
      'status': 'active',
      'displayName': 'Thiago Mendes',
      'extraPerms': extraPerms,
    });

Future<GoRouter> _pump(
  WidgetTester tester,
  String location,
  _Coach coach,
  _Mgmt mgmt, {
  DateTime? now,
  Future<List<AppUserProfile>> Function(String term)? search,
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
        builder: (_, __) => const CenterModeShellPage(),
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
        path: AppRoutes.centerCoachToday,
        name: AppRouteNames.centerCoachToday,
        builder: (_, s) =>
            CenterCoachTodayPage(centerId: s.pathParameters['centerId']!),
      ),
      GoRoute(
        path: AppRoutes.centerCoachClasses,
        name: AppRouteNames.centerCoachClasses,
        builder: (_, s) =>
            CenterCoachClassesPage(centerId: s.pathParameters['centerId']!),
      ),
      GoRoute(
        path: AppRoutes.centerCoachTeam,
        name: AppRouteNames.centerCoachTeam,
        builder: (_, s) =>
            CenterCoachTeamPage(centerId: s.pathParameters['centerId']!),
      ),
      GoRoute(
        path: AppRoutes.centerCoachEnroll,
        name: AppRouteNames.centerCoachEnroll,
        builder: (_, s) => CenterCoachEnrollPage(
          centerId: s.pathParameters['centerId']!,
          studentId: s.uri.queryParameters['aluno'],
        ),
      ),
      GoRoute(
        path: AppRoutes.centerCoachSubscription,
        name: AppRouteNames.centerCoachSubscription,
        builder: (_, s) => CenterCoachSubscriptionPage(
          centerId: s.pathParameters['centerId']!,
          studentId: s.pathParameters['studentId']!,
          subscriptionId: s.pathParameters['subscriptionId']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.centerCoachNewStudent,
        name: AppRouteNames.centerCoachNewStudent,
        builder: (_, s) => CenterCoachNewStudentPage(
          centerId: s.pathParameters['centerId']!,
          thenEnroll: s.uri.queryParameters['matricular'] == '1',
        ),
      ),
      GoRoute(
        path: AppRoutes.centerCoachStudent,
        name: AppRouteNames.centerCoachStudent,
        builder: (_, s) =>
            Scaffold(body: Text('perfil ${s.pathParameters['studentId']}')),
      ),
      GoRoute(
        path: AppRoutes.centerCoachInvoice,
        name: AppRouteNames.centerCoachInvoice,
        builder: (_, s) => CenterCoachInvoicePage(
          centerId: s.pathParameters['centerId']!,
          invoiceId: s.pathParameters['invoiceId']!,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  final clock = now ?? _fri;
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        professorLinksUidProvider.overrideWithValue('tm'),
        professorLinksClockProvider.overrideWithValue(() => clock),
        centerCoachRepositoryProvider.overrideWithValue(coach),
        centerManagementRepositoryProvider.overrideWithValue(mgmt),
        centerSelectionStoreProvider.overrideWithValue(_MemoryCenterStore()),
        centerAccountSearchProvider.overrideWithValue(
          search ?? (_) async => const [],
        ),
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

Future<void> _type(WidgetTester tester, Key key, String text) async {
  await tester.enterText(
    find.descendant(of: find.byKey(key), matching: find.byType(TextField)),
    text,
  );
  await _settle(tester);
}

Future<void> _typeField(WidgetTester tester, Key key, String text) async {
  await tester.enterText(find.byKey(key), text);
  await _settle(tester);
}

VoidCallback? _primaryOnPressed(WidgetTester tester, Key key) =>
    tester.widget<ProfessorLinksPrimaryButton>(find.byKey(key)).onPressed;

VoidCallback? _ghostOnPressed(WidgetTester tester, Key key) =>
    tester.widget<ProfessorLinksGhostButton>(find.byKey(key)).onPressed;

const _teamPath = '/athlete/professor/centros/c1/equipe';
const _enrollPath = '/athlete/professor/centros/c1/matricular';
const _newStudentPath = '/athlete/professor/centros/c1/alunos/novo';
const _subPath = '/athlete/professor/centros/c1/alunos/s1/assinatura/sub1';

void main() {
  setUpAll(() async {
    await initializeNexagoEventTimezone();
  });

  // ── G17/G18 · Equipe ────────────────────────────────────────────────────
  group('G17/G18 · equipe', () {
    _Mgmt teamMgmt() => _Mgmt(
          team: const [
            CenterTeamMember(
              uid: 'tm',
              displayName: 'Thiago Mendes',
              role: 'center_owner',
              status: 'active',
              email: 'thiago@ct.com',
            ),
            CenterTeamMember(
              uid: 'a1',
              displayName: 'Ana Admin',
              role: 'center_admin',
              status: 'active',
              email: 'ana@ct.com',
            ),
            CenterTeamMember(
              uid: 'p1',
              displayName: 'Paula Lima',
              role: 'coach',
              status: 'active',
              email: 'paula@ct.com',
            ),
            CenterTeamMember(
              uid: 'r1',
              displayName: 'Rita Souza',
              role: 'receptionist',
              status: 'active',
              email: 'rita@ct.com',
            ),
            CenterTeamMember(
              uid: 'x1',
              displayName: 'Xavier Antigo',
              role: 'coach',
              status: 'revoked',
              email: 'xavier@ct.com',
            ),
          ],
          invites: const [
            CenterInvite(
              id: 'inv1',
              email: 'novo@ct.com',
              role: 'coach',
              status: 'pending',
              invitedByName: 'Thiago Mendes',
            ),
            CenterInvite(
              id: 'inv2',
              email: 'velho@ct.com',
              role: 'coach',
              status: 'accepted',
            ),
          ],
        );

    testWidgets('owner vê vínculos, convite pendente e filtra por papel', (
      tester,
    ) async {
      final mgmt = teamMgmt();
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);

      // 4 ativos (o revogado não conta) e só o convite pendente.
      expect(find.text('4 VÍNCULOS NESTE CENTRO · 1 CONVITE'), findsOneWidget);
      final invite = find.byKey(const Key('center-team-invite-inv1'));
      expect(invite, findsOneWidget);
      expect(
        find.descendant(of: invite, matching: find.text('CONVITE')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('center-team-invite-inv2')), findsNothing);
      for (final uid in ['tm', 'a1', 'p1', 'r1', 'x1']) {
        expect(find.byKey(Key('center-team-member-$uid')), findsOneWidget);
      }
      expect(find.text('REVOGADO'), findsOneWidget);

      // Revogado vai para o fim da lista.
      final paula = tester.getTopLeft(
        find.byKey(const Key('center-team-member-p1')),
      );
      final xavier = tester.getTopLeft(
        find.byKey(const Key('center-team-member-x1')),
      );
      expect(paula.dy, lessThan(xavier.dy));

      await _tap(
          tester, find.byKey(const Key('center-team-filter-receptionist')));
      expect(find.byKey(const Key('center-team-member-r1')), findsOneWidget);
      expect(find.byKey(const Key('center-team-member-p1')), findsNothing);
      expect(find.byKey(const Key('center-team-invite-inv1')), findsNothing);

      await _tap(tester, find.byKey(const Key('center-team-filter-admin')));
      expect(find.byKey(const Key('center-team-member-tm')), findsOneWidget);
      expect(find.byKey(const Key('center-team-member-a1')), findsOneWidget);
      expect(find.byKey(const Key('center-team-member-r1')), findsNothing);

      await _tap(tester, find.byKey(const Key('center-team-filter-coach')));
      expect(find.byKey(const Key('center-team-invite-inv1')), findsOneWidget);
      expect(find.byKey(const Key('center-team-member-p1')), findsOneWidget);
      expect(find.byKey(const Key('center-team-member-x1')), findsOneWidget);
      expect(find.byKey(const Key('center-team-member-a1')), findsNothing);
    });

    testWidgets('filtro sem ninguém mostra o vazio', (tester) async {
      final mgmt = teamMgmt()
        ..team = [teamMgmt().team.first]
        ..invites = const [];
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
      await _tap(tester, find.byKey(const Key('center-team-filter-coach')));
      expect(find.text('Ninguém com esse papel ainda.'), findsOneWidget);
    });

    testWidgets('convite: valida e-mail, já membro e convite pendente', (
      tester,
    ) async {
      final mgmt = teamMgmt();
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
      await _tap(tester, find.byKey(const Key('center-team-invite')));
      expect(find.byKey(const Key('center-invite-sheet')), findsOneWidget);

      await _tap(tester, find.byKey(const Key('center-invite-send')));
      expect(find.text('Informe um e-mail válido.'), findsOneWidget);

      await _type(tester, const Key('center-invite-email'), 'paula@ct');
      await _tap(tester, find.byKey(const Key('center-invite-send')));
      expect(find.text('Informe um e-mail válido.'), findsOneWidget);

      await _type(tester, const Key('center-invite-email'), ' PAULA@ct.com ');
      await _tap(tester, find.byKey(const Key('center-invite-send')));
      expect(find.text('Essa pessoa já faz parte da equipe.'), findsOneWidget);

      await _type(tester, const Key('center-invite-email'), 'novo@ct.com');
      await _tap(tester, find.byKey(const Key('center-invite-send')));
      expect(
        find.text('Já existe um convite pendente para esse e-mail.'),
        findsOneWidget,
      );

      // Revogado pode ser convidado de novo.
      await _type(tester, const Key('center-invite-email'), 'xavier@ct.com');
      await _tap(tester, find.byKey(const Key('center-invite-send')));
      expect(mgmt.invited, hasLength(1));
      expect(mgmt.invited.single['email'], 'xavier@ct.com');
      expect(find.byKey(const Key('center-invite-sheet')), findsNothing);
    });

    testWidgets('convite de professor leva modalidade e turma escolhidas', (
      tester,
    ) async {
      final mgmt = teamMgmt();
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
      await _tap(tester, find.byKey(const Key('center-team-invite')));

      // Owner pode convidar admin.
      expect(find.byKey(const ValueKey('center-seg-coach')), findsOneWidget);
      expect(
        find.byKey(const ValueKey('center-seg-receptionist')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('center-seg-center_admin')),
        findsOneWidget,
      );
      expect(
        find.text('Professor não vê cobranças, planos nem configurações.'),
        findsOneWidget,
      );

      await _type(tester, const Key('center-invite-email'), 'joao@ct.com');
      await _type(tester, const Key('center-invite-name'), 'João Lima');
      await _tap(tester, find.byKey(const Key('center-invite-program-bt')));
      // Só as turmas da modalidade escolhida.
      expect(find.byKey(const Key('center-invite-class-k1')), findsOneWidget);
      expect(find.byKey(const Key('center-invite-class-v1')), findsNothing);
      await _tap(tester, find.byKey(const Key('center-invite-class-k2')));
      await _tap(tester, find.byKey(const Key('center-invite-send')));

      expect(mgmt.invited.single, {
        'centerId': 'c1',
        'centerName': 'CT Maré Alta',
        'email': 'joao@ct.com',
        'displayName': 'João Lima',
        'role': 'coach',
        'programIds': ['bt'],
        'classIds': ['k2'],
        'actor': 'Thiago Mendes',
      });
      expect(find.text('Convite enviado para joao@ct.com.'), findsOneWidget);
    });

    // Regressão: turma escolhida que sai do filtro de modalidade não pode ir
    // no convite (o filtro antigo usava a lista do build anterior).
    testWidgets(
      'convite: trocar a modalidade descarta turma que saiu do filtro',
      (tester) async {
        final mgmt = teamMgmt();
        await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
        await _tap(tester, find.byKey(const Key('center-team-invite')));
        await _type(tester, const Key('center-invite-email'), 'joao@ct.com');
        // Sem modalidade todas aparecem: escolhe uma turma de beach tennis…
        await _tap(tester, find.byKey(const Key('center-invite-class-k1')));
        // …e depois restringe a vôlei: k1 some da tela.
        await _tap(
            tester, find.byKey(const Key('center-invite-program-volei')));
        expect(find.byKey(const Key('center-invite-class-k1')), findsNothing);
        await _tap(tester, find.byKey(const Key('center-invite-send')));
        expect(mgmt.invited.single['programIds'], ['volei']);
        expect(mgmt.invited.single['classIds'], isEmpty);
      },
    );

    testWidgets('convite de recepção não leva modalidades nem turmas', (
      tester,
    ) async {
      final mgmt = teamMgmt();
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
      await _tap(tester, find.byKey(const Key('center-team-invite')));
      await _type(tester, const Key('center-invite-email'), 'rec@ct.com');
      await _tap(tester, find.byKey(const Key('center-invite-program-bt')));
      await _tap(
        tester,
        find.byKey(const ValueKey('center-seg-receptionist')),
      );
      expect(find.byKey(const Key('center-invite-program-bt')), findsNothing);
      await _tap(tester, find.byKey(const Key('center-invite-send')));
      expect(mgmt.invited.single['role'], 'receptionist');
      expect(mgmt.invited.single['programIds'], isEmpty);
      expect(mgmt.invited.single['classIds'], isEmpty);
    });

    testWidgets('erro do servidor fica na folha', (tester) async {
      final mgmt = teamMgmt()
        ..failWith = const CenterCoachException('Sem permissão para convidar.');
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
      await _tap(tester, find.byKey(const Key('center-team-invite')));
      await _type(tester, const Key('center-invite-email'), 'joao@ct.com');
      await _tap(tester, find.byKey(const Key('center-invite-send')));
      expect(find.byKey(const Key('center-invite-sheet')), findsOneWidget);
      expect(find.text('Sem permissão para convidar.'), findsOneWidget);
    });

    testWidgets('admin não convida admin nem revoga admin/owner', (
      tester,
    ) async {
      final mgmt = teamMgmt();
      await _pump(
        tester,
        _teamPath,
        _Coach(memberships: [_member(role: 'center_admin')]),
        mgmt,
      );
      // Sem toque: owner, o próprio admin e quem já foi revogado.
      for (final uid in ['tm', 'a1', 'x1']) {
        await _tap(tester, find.byKey(Key('center-team-member-$uid')));
        expect(
          find.byKey(const Key('center-team-revoke-sheet')),
          findsNothing,
          reason: '$uid não pode ser revogado por admin',
        );
      }
      await _tap(tester, find.byKey(const Key('center-team-member-p1')));
      expect(find.byKey(const Key('center-team-revoke-sheet')), findsOneWidget);
      await tester.tapAt(const Offset(10, 10));
      await _settle(tester);

      await _tap(tester, find.byKey(const Key('center-team-invite')));
      expect(find.byKey(const ValueKey('center-seg-coach')), findsOneWidget);
      expect(
        find.byKey(const ValueKey('center-seg-center_admin')),
        findsNothing,
      );
    });

    testWidgets('revogar exige motivo de 3+ letras e chama o repositório', (
      tester,
    ) async {
      final mgmt = teamMgmt();
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
      // Owner revoga admin.
      await _tap(tester, find.byKey(const Key('center-team-member-a1')));
      expect(find.byKey(const Key('center-team-revoke-sheet')), findsOneWidget);
      expect(
        _ghostOnPressed(tester, const Key('center-team-revoke')),
        isNull,
      );
      await _type(tester, const Key('center-team-revoke-reason'), ' ab ');
      expect(
        _ghostOnPressed(tester, const Key('center-team-revoke')),
        isNull,
        reason: 'espaços não contam',
      );
      await _type(
        tester,
        const Key('center-team-revoke-reason'),
        '  Saiu do centro  ',
      );
      expect(
        _ghostOnPressed(tester, const Key('center-team-revoke')),
        isNotNull,
      );
      await _tap(tester, find.byKey(const Key('center-team-revoke')));
      expect(mgmt.revoked.single, {
        'uid': 'a1',
        'reason': 'Saiu do centro',
        'actor': 'tm',
      });
      expect(find.text('Acesso de Ana Admin revogado.'), findsOneWidget);
    });

    testWidgets('cancelar convite pendente', (tester) async {
      final mgmt = teamMgmt();
      await _pump(tester, _teamPath, _Coach(memberships: [_member()]), mgmt);
      await _tap(tester, find.byKey(const Key('center-team-invite-inv1')));
      expect(find.byKey(const Key('center-team-invite-sheet')), findsOneWidget);
      expect(
        find.text('Professor · convite pendente · por Thiago Mendes'),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('center-team-invite-cancel')));
      expect(mgmt.cancelledInvites, ['inv1']);
    });

    testWidgets('quem não é gestão só vê o aviso', (tester) async {
      for (final role in ['coach', 'receptionist']) {
        await _pump(
          tester,
          _teamPath,
          _Coach(memberships: [_member(role: role)]),
          teamMgmt(),
        );
        expect(
          find.text('Só o owner e os admins do centro cuidam da equipe.'),
          findsOneWidget,
        );
        expect(find.byKey(const Key('center-team-invite')), findsNothing);
        expect(find.byKey(const Key('center-team-member-p1')), findsNothing);
      }
    });
  });

  // ── G11–G13 · Matrícula ─────────────────────────────────────────────────
  group('G11–G13 · matrícula', () {
    const plans = [
      CenterPlan(
        id: 'p2',
        name: 'Mensal 2x',
        type: 'monthly',
        priceCents: 32000,
        classesPerWeek: 2,
        programIds: ['bt'],
      ),
      CenterPlan(
        id: 'p8',
        name: 'Pacote 8',
        type: 'class_pack',
        priceCents: 48000,
        credits: 8,
        validityDays: 60,
      ),
      CenterPlan(
        id: 'pv',
        name: 'Mensal Vôlei',
        type: 'monthly',
        priceCents: 25000,
        programIds: ['volei'],
      ),
      CenterPlan(
        id: 'old',
        name: 'Plano antigo',
        type: 'monthly',
        priceCents: 10000,
        status: 'archived',
      ),
    ];

    _Coach desk({List<CenterCoachEnrollment> enrollments = const []}) => _Coach(
          memberships: [_member(role: 'receptionist')],
          enrollments: enrollments,
        );

    testWidgets('aluno pré-escolhido: turma, plano proporcional e pendente', (
      tester,
    ) async {
      final mgmt = _Mgmt(plans: plans);
      await _pump(tester, '$_enrollPath?aluno=s1', desk(), mgmt, now: _tue);

      expect(find.byKey(const Key('center-enroll-search')), findsNothing);
      expect(find.text('MARINA TELES'), findsOneWidget);
      expect(find.byKey(const Key('center-enroll-class-k2')), findsOneWidget);
      expect(
        find.byKey(const Key('center-enroll-class-v1')),
        findsNothing,
        reason: 'só a primeira modalidade usada aparece',
      );
      expect(
        _primaryOnPressed(tester, const Key('center-enroll-next-class')),
        isNull,
      );

      await _tap(tester, find.byKey(const Key('center-enroll-class-k2')));
      await _tap(tester, find.byKey(const Key('center-enroll-next-class')));

      // Plano: só os ativos e da modalidade (Mensal Vôlei e o arquivado não).
      expect(find.byKey(const Key('center-enroll-plan-p2')), findsOneWidget);
      expect(find.byKey(const Key('center-enroll-plan-pv')), findsNothing);
      expect(find.byKey(const Key('center-enroll-plan-old')), findsNothing);
      expect(
        _primaryOnPressed(tester, const Key('center-enroll-next-plan')),
        isNull,
      );
      await _tap(tester, find.byKey(const Key('center-enroll-plan-p2')));
      // 32000 × 16/31 dias até o vencimento 05/11 (dia 5, proporcional).
      expect(find.text('Proporcional · R\$ 165,16'), findsOneWidget);
      expect(find.text('Todo dia 05'), findsOneWidget);
      expect(find.text('20 out'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('center-enroll-next-plan')));
      expect(find.text('Matricular e cobrar R\$ 165,16'), findsOneWidget);
      expect(
        find.text(
          'A matrícula fica pendente e a vaga reservada por 48h, até o '
          'pagamento ser confirmado.',
        ),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('center-enroll-submit')));

      expect(mgmt.enrolls.single, {
        'student': 's1',
        'class': 'k2',
        'plan': 'p2',
        'startDate': '2026-10-20',
        'today': '2026-10-20',
        'canBill': true,
      });
      expect(
        tester
            .widget<Text>(find.byKey(const Key('center-enroll-result-title')))
            .data,
        'Matrícula pendente',
      );
      expect(find.text('R\$ 165,16 · Pix'), findsOneWidget);
      // Recepção não vê o atalho para a cobrança (sem view_finance).
      expect(find.byKey(const Key('center-enroll-open-invoice')), findsNothing);
    });

    testWidgets('pacote: valor cheio, sem proporcional; início amanhã', (
      tester,
    ) async {
      final mgmt = _Mgmt(plans: plans)
        ..enrollResult = const CenterEnrolled(
          enrollmentId: 'e9',
          status: 'active',
          invoiceId: 'inv9',
          amountCents: 48000,
        );
      await _pump(tester, '$_enrollPath?aluno=s1', desk(), mgmt, now: _tue);
      await _tap(tester, find.byKey(const Key('center-enroll-class-k2')));
      await _tap(tester, find.byKey(const Key('center-enroll-next-class')));
      await _tap(tester, find.byKey(const ValueKey('center-seg-class_pack')));
      expect(find.byKey(const Key('center-enroll-plan-p2')), findsNothing);
      await _tap(tester, find.byKey(const Key('center-enroll-plan-p8')));
      await _tap(tester, find.byKey(const Key('center-enroll-start-tomorrow')));
      expect(find.text('R\$ 480'), findsWidgets);
      expect(find.textContaining('Proporcional'), findsNothing);
      expect(find.text('60 dias'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-enroll-next-plan')));
      await _tap(tester, find.byKey(const Key('center-enroll-submit')));
      expect(mgmt.enrolls.single['plan'], 'p8');
      expect(mgmt.enrolls.single['startDate'], '2026-10-21');
      expect(find.text('Matrícula ativa'), findsOneWidget);
    });

    testWidgets('turma lotada: alternativa do mesmo nível vai para o plano', (
      tester,
    ) async {
      final mgmt = _Mgmt(plans: plans);
      await _pump(tester, '$_enrollPath?aluno=s1', desk(), mgmt, now: _tue);
      expect(find.text('LOTADA'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-enroll-class-k1')));

      expect(find.byKey(const Key('center-enroll-full-sheet')), findsOneWidget);
      expect(find.text('BT Intermediário B está lotada'), findsOneWidget);
      expect(
        find.byKey(const Key('center-enroll-full-waitlist')),
        findsOneWidget,
      );
      expect(find.text('Marina será o 1º · aviso quando abrir vaga'),
          findsOneWidget);
      expect(
        find.byKey(const Key('center-enroll-full-alt-k2')),
        findsOneWidget,
      );
      expect(
        find.byKey(const Key('center-enroll-full-alt-k3')),
        findsNothing,
        reason: 'outro nível não é alternativa',
      );

      await _tap(tester, find.byKey(const Key('center-enroll-full-alt-k2')));
      await _tap(tester, find.byKey(const Key('center-enroll-full-continue')));

      expect(find.byKey(const Key('center-enroll-plan-p2')), findsOneWidget);
      expect(
          find.text('MARINA TELES · BT INTERMEDIÁRIO SÁBADO'), findsOneWidget);
      expect(find.text('Revisar matrícula'), findsOneWidget);
      expect(find.textContaining('Turma lotada: o aluno entra'), findsNothing);
    });

    testWidgets('lotou na hora de gravar: volta para a turma com aviso', (
      tester,
    ) async {
      final mgmt = _Mgmt(plans: plans)
        ..enrollResult = const CenterEnrollFull(capacity: 8, seatsTaken: 8);
      await _pump(tester, '$_enrollPath?aluno=s1', desk(), mgmt, now: _tue);
      await _tap(tester, find.byKey(const Key('center-enroll-class-k2')));
      await _tap(tester, find.byKey(const Key('center-enroll-next-class')));
      await _tap(tester, find.byKey(const Key('center-enroll-plan-p2')));
      await _tap(tester, find.byKey(const Key('center-enroll-next-plan')));
      await _tap(tester, find.byKey(const Key('center-enroll-submit')));

      expect(mgmt.enrolls, hasLength(1));
      expect(find.textContaining('lotou agora (8/8)'), findsOneWidget);
      expect(find.byKey(const Key('center-enroll-class-k2')), findsOneWidget);
      expect(
        _primaryOnPressed(tester, const Key('center-enroll-next-class')),
        isNull,
        reason: 'a turma escolhida foi limpa',
      );
      expect(find.byKey(const Key('center-enroll-result-title')), findsNothing);
    });

    testWidgets('erro do servidor fica na confirmação', (tester) async {
      final mgmt = _Mgmt(plans: plans)
        ..failWith = const CenterCoachException('Centro suspenso.');
      await _pump(tester, '$_enrollPath?aluno=s1', desk(), mgmt, now: _tue);
      await _tap(tester, find.byKey(const Key('center-enroll-class-k2')));
      await _tap(tester, find.byKey(const Key('center-enroll-next-class')));
      await _tap(tester, find.byKey(const Key('center-enroll-plan-p2')));
      await _tap(tester, find.byKey(const Key('center-enroll-next-plan')));
      await _tap(tester, find.byKey(const Key('center-enroll-submit')));
      expect(find.text('Centro suspenso.'), findsOneWidget);
      expect(find.byKey(const Key('center-enroll-submit')), findsOneWidget);
    });

    testWidgets('lista de espera: entra na fila sem cobrar', (tester) async {
      final mgmt = _Mgmt(plans: plans);
      await _pump(
        tester,
        '$_enrollPath?aluno=s1',
        desk(
          enrollments: const [
            CenterCoachEnrollment(
              id: 'w1',
              studentId: 's2',
              classId: 'k1',
              status: 'waitlisted',
            ),
          ],
        ),
        mgmt,
        now: _tue,
      );
      expect(find.text('LOTADA · 1 NA ESPERA'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-enroll-class-k1')));
      expect(find.text('Marina será o 2º · aviso quando abrir vaga'),
          findsOneWidget);
      // A fila já vem escolhida.
      await _tap(tester, find.byKey(const Key('center-enroll-full-continue')));

      expect(
          find.textContaining('Turma lotada: o aluno entra'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-enroll-plan-p2')));
      expect(
        find.byKey(const Key('center-enroll-start-today')),
        findsNothing,
        reason: 'sem condições: o contrato só sai na oferta',
      );
      expect(find.text('Revisar lista de espera'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-enroll-next-plan')));
      expect(find.text('Entrar na lista de espera'), findsOneWidget);
      expect(find.text('Preço do contrato'), findsNothing);
      await _tap(tester, find.byKey(const Key('center-enroll-submit')));

      expect(mgmt.enrolls, isEmpty);
      expect(mgmt.waitlists.single, {
        'student': 's1',
        'class': 'k1',
        'plan': 'p2',
      });
      expect(find.text('Na lista de espera'), findsOneWidget);
    });

    // Regressão: a posição na fila do resultado conta quem já está nela
    // (as matrículas são autoDispose e sumiam fora do passo da turma).
    testWidgets(
      'lista de espera: posição do resultado conta quem já está na fila',
      (tester) async {
        final mgmt = _Mgmt(plans: plans);
        await _pump(
          tester,
          '$_enrollPath?aluno=s1',
          desk(
            enrollments: const [
              CenterCoachEnrollment(
                id: 'w1',
                studentId: 's2',
                classId: 'k1',
                status: 'waitlisted',
              ),
            ],
          ),
          mgmt,
          now: _tue,
        );
        await _tap(tester, find.byKey(const Key('center-enroll-class-k1')));
        await _tap(
            tester, find.byKey(const Key('center-enroll-full-continue')));
        await _tap(tester, find.byKey(const Key('center-enroll-plan-p2')));
        await _tap(tester, find.byKey(const Key('center-enroll-next-plan')));
        await _tap(tester, find.byKey(const Key('center-enroll-submit')));
        expect(find.textContaining('Marina é o 2º da fila'), findsOneWidget);
      },
    );

    testWidgets('sem ?aluno=: busca e escolhe o aluno', (tester) async {
      await _pump(
        tester,
        _enrollPath,
        desk(
          enrollments: const [
            CenterCoachEnrollment(
              id: 'e1',
              studentId: 's2',
              classId: 'k2',
              status: 'active',
            ),
          ],
        ),
        _Mgmt(plans: plans),
        now: _tue,
      );
      expect(find.text('ESCOLHA O ALUNO'), findsOneWidget);
      expect(find.byKey(const Key('center-enroll-student-s1')), findsOneWidget);
      await _typeField(tester, const Key('center-enroll-search'), 'cai');
      expect(find.byKey(const Key('center-enroll-student-s1')), findsNothing);
      expect(find.byKey(const Key('center-enroll-student-s2')), findsOneWidget);

      await _typeField(tester, const Key('center-enroll-search'), 'zzz');
      expect(find.textContaining('Nenhum aluno encontrado'), findsOneWidget);

      await _typeField(tester, const Key('center-enroll-search'), 'cai');
      await _tap(tester, find.byKey(const Key('center-enroll-student-s2')));
      expect(find.text('CAIO RAMOS'), findsOneWidget);
      // Já matriculado na k2: não dá para escolher de novo.
      expect(find.text('JÁ MATRICULADO'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-enroll-class-k2')));
      expect(
        _primaryOnPressed(tester, const Key('center-enroll-next-class')),
        isNull,
      );
    });

    testWidgets('professor sem enroll_students não matricula', (tester) async {
      await _pump(
        tester,
        '$_enrollPath?aluno=s1',
        _Coach(memberships: [_member(role: 'coach')]),
        _Mgmt(plans: plans),
        now: _tue,
      );
      expect(
        find.text('Sem permissão para matricular neste centro.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('center-enroll-class-k2')), findsNothing);
    });
  });

  // ── W10 · Novo aluno ────────────────────────────────────────────────────
  group('novo aluno', () {
    _Coach desk() => _Coach(memberships: [_member(role: 'receptionist')]);

    testWidgets('convite por e-mail: valida e grava convidado', (tester) async {
      final mgmt = _Mgmt();
      await _pump(tester, _newStudentPath, desk(), mgmt);
      await _tap(tester, find.byKey(const ValueKey('center-seg-invite')));
      expect(find.text('Enviar convite'), findsOneWidget);

      await _tap(tester, find.byKey(const Key('center-new-student-save')));
      expect(find.text('Informe o nome completo.'), findsOneWidget);
      expect(mgmt.added, isEmpty);

      await _type(tester, const Key('center-new-student-name'), 'Bia Nunes');
      await _type(
        tester,
        const Key('center-new-student-email'),
        'Bia@Mail.com',
      );
      await _tap(tester, find.byKey(const Key('center-new-student-save')));
      expect(mgmt.added, hasLength(1));
      final input = mgmt.added.single;
      expect(input.linked, isFalse);
      expect(input.name, 'Bia Nunes');
      expect(input.email, 'Bia@Mail.com');
      expect(input.guardian, isNull);
      // Cai no perfil do aluno novo.
      expect(find.text('perfil new1'), findsOneWidget);
    });

    testWidgets('menor exige responsável', (tester) async {
      final mgmt = _Mgmt();
      await _pump(tester, _newStudentPath, desk(), mgmt);
      await _tap(tester, find.byKey(const ValueKey('center-seg-invite')));
      await _type(tester, const Key('center-new-student-name'), 'Leo Dias');
      await _type(tester, const Key('center-new-student-email'), 'leo@x.com');
      await _tap(tester, find.byKey(const Key('center-new-student-minor')));
      await _tap(tester, find.byKey(const Key('center-new-student-save')));
      expect(find.text('Informe a data de nascimento.'), findsOneWidget);
      expect(mgmt.added, isEmpty);
    });

    testWidgets('conta NexaGO: busca, já-aluno bloqueado, vincula', (
      tester,
    ) async {
      final mgmt = _Mgmt();
      final coach = desk()
        ..students = const [
          CenterCoachStudent(id: 's1', name: 'Marina Teles', uid: 'u-marina'),
        ];
      await _pump(
        tester,
        '$_newStudentPath?matricular=1',
        coach,
        mgmt,
        search: (_) async => const [
          AppUserProfile(uid: 'u-marina', fullName: 'Marina Teles'),
          AppUserProfile(uid: 'u-joao', fullName: 'João Lima', city: 'Recife'),
        ],
      );
      await _type(tester, const Key('center-new-student-term'), 'lima');
      await tester.pump(const Duration(milliseconds: 400));
      await _settle(tester);
      expect(find.text('JÁ É ALUNO'), findsOneWidget);
      await _tap(
          tester, find.byKey(const Key('center-new-student-hit-u-marina')));
      expect(find.text('SELECIONADO'), findsNothing);

      await _tap(
          tester, find.byKey(const Key('center-new-student-hit-u-joao')));
      expect(find.text('SELECIONADO'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-new-student-save')));
      expect(mgmt.added.single.uid, 'u-joao');
      expect(mgmt.added.single.name, 'João Lima');
      // Veio do Matricular: segue para a matrícula com o aluno escolhido.
      expect(find.byType(CenterCoachEnrollPage), findsOneWidget);
    });

    testWidgets('busca sem resultado leva ao convite com o nome', (
      tester,
    ) async {
      await _pump(tester, _newStudentPath, desk(), _Mgmt());
      await _type(tester, const Key('center-new-student-term'), 'Zé Ninguém');
      await tester.pump(const Duration(milliseconds: 400));
      await _settle(tester);
      await _tap(tester, find.byKey(const Key('center-new-student-to-invite')));
      expect(find.text('Enviar convite'), findsOneWidget);
      expect(find.text('Zé Ninguém'), findsOneWidget);
    });

    testWidgets('professor sem enroll_students não cadastra', (tester) async {
      await _pump(
        tester,
        _newStudentPath,
        _Coach(memberships: [_member(role: 'coach')]),
        _Mgmt(),
      );
      expect(
        find.text('Sem permissão para cadastrar alunos neste centro.'),
        findsOneWidget,
      );
    });
  });

  // ── R6 · Assinatura ─────────────────────────────────────────────────────
  group('R6 · assinatura', () {
    CenterSubscription sub({String status = 'active'}) =>
        CenterSubscription.fromMap('sub1', {
          'enrollmentId': 'e1',
          'studentId': 's1',
          'studentName': 'Marina Teles',
          'className': 'BT Intermediário B',
          'planName': 'Mensal 2x',
          'priceCents': 32000,
          'billingDay': 5,
          'method': 'pix_manual',
          'status': status,
          'startDate': '2026-08-05',
          'nextChargeDate': '2026-11-05',
          if (status == 'canceling') 'cancelAt': '2026-11-05',
        });

    _Coach owner({String role = 'center_owner'}) => _Coach(
          memberships: [_member(role: role)],
          invoices: [
            CenterCoachInvoice(
              id: 'i9',
              status: 'approved',
              amountCents: 32000,
              dueDate: '2026-09-05',
              enrollmentId: 'e1',
              approvedAt: DateTime.utc(2026, 9, 4, 15),
            ),
            CenterCoachInvoice(
              id: 'i10',
              status: 'approved',
              amountCents: 32000,
              dueDate: '2026-10-05',
              enrollmentId: 'e1',
              approvedAt: DateTime.utc(2026, 10, 4, 15),
            ),
            const CenterCoachInvoice(
              id: 'other',
              status: 'pending',
              amountCents: 48000,
              dueDate: '2026-10-05',
              enrollmentId: 'e2',
            ),
          ],
        );

    testWidgets('situação, ciclos da matrícula e cancelar no fim do ciclo', (
      tester,
    ) async {
      final mgmt = _Mgmt(subscriptions: [sub()]);
      await _pump(tester, _subPath, owner(), mgmt);

      final hero = find.byKey(const Key('center-subscription-hero'));
      expect(hero, findsOneWidget);
      expect(
        find.descendant(of: hero, matching: find.text('EM DIA')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: hero, matching: find.text('R\$ 320/mês')),
        findsOneWidget,
      );
      expect(find.text('MARINA TELES · MENSAL 2X'), findsOneWidget);
      expect(find.text('05 nov · R\$ 320'), findsOneWidget);

      // Só as cobranças desta matrícula, a mais recente primeiro.
      final oct = find.byKey(const Key('center-subscription-cycle-i10'));
      final sep = find.byKey(const Key('center-subscription-cycle-i9'));
      expect(oct, findsOneWidget);
      expect(sep, findsOneWidget);
      expect(
        find.byKey(const Key('center-subscription-cycle-other')),
        findsNothing,
      );
      expect(
        tester.getTopLeft(oct).dy,
        lessThan(tester.getTopLeft(sep).dy),
      );
      expect(find.text('Out 2026'), findsOneWidget);
      expect(find.text('Set 2026'), findsOneWidget);

      expect(
          find.byKey(const Key('center-subscription-charge')), findsOneWidget);
      expect(find.byKey(const Key('center-subscription-undo')), findsNothing);
      await _tap(tester, find.byKey(const Key('center-subscription-cancel')));
      expect(
        find.byKey(const Key('center-subscription-cancel-sheet')),
        findsOneWidget,
      );
      expect(find.text('Encerra em 05 nov'), findsOneWidget);
      await _tap(
        tester,
        find.byKey(const Key('center-subscription-cancel-confirm')),
      );
      expect(mgmt.scheduledCancels, ['sub1']);
    });

    testWidgets('fechar a folha não agenda o cancelamento', (tester) async {
      final mgmt = _Mgmt(subscriptions: [sub()]);
      await _pump(tester, _subPath, owner(), mgmt);
      await _tap(tester, find.byKey(const Key('center-subscription-cancel')));
      await tester.tapAt(const Offset(10, 10));
      await _settle(tester);
      expect(mgmt.scheduledCancels, isEmpty);
    });

    testWidgets('cancelando: desfazer, sem cobrar nem cancelar de novo', (
      tester,
    ) async {
      final mgmt = _Mgmt(subscriptions: [sub(status: 'canceling')]);
      await _pump(tester, _subPath, owner(), mgmt);
      expect(find.text('CANCELA NO FIM DO CICLO'), findsOneWidget);
      expect(find.text('Encerra em'), findsOneWidget);
      expect(find.byKey(const Key('center-subscription-cancel')), findsNothing);
      expect(find.byKey(const Key('center-subscription-charge')), findsNothing);
      await _tap(tester, find.byKey(const Key('center-subscription-undo')));
      expect(mgmt.undos, ['sub1']);
    });

    testWidgets('cobrar agora chama o servidor', (tester) async {
      final mgmt = _Mgmt(subscriptions: [sub(status: 'past_due')]);
      await _pump(tester, _subPath, owner(), mgmt);
      expect(find.text('EM ATRASO'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('center-subscription-charge')));
      expect(mgmt.charges, ['sub1']);
      expect(
        find.text('Cobrança gerada · o link sai em instantes.'),
        findsOneWidget,
      );
    });

    testWidgets('recepção vê a situação, mas sem ações', (tester) async {
      await _pump(
        tester,
        _subPath,
        owner(role: 'receptionist'),
        _Mgmt(subscriptions: [sub()]),
      );
      expect(
        find.byKey(const Key('center-subscription-hero')),
        findsOneWidget,
      );
      for (final k in ['charge', 'cancel', 'undo']) {
        expect(find.byKey(Key('center-subscription-$k')), findsNothing);
      }
      // Sem view_finance não há ciclos.
      expect(find.text('CICLOS'), findsNothing);
    });

    testWidgets('professor não vê a assinatura nem as ações', (tester) async {
      await _pump(
        tester,
        _subPath,
        owner(role: 'coach'),
        _Mgmt(subscriptions: [sub()]),
      );
      expect(find.text('Assinatura não encontrada.'), findsOneWidget);
      for (final k in ['charge', 'cancel', 'undo']) {
        expect(find.byKey(Key('center-subscription-$k')), findsNothing);
      }
    });
  });

  // ── L6 · Local desta aula ───────────────────────────────────────────────
  group('L6 · local da aula', () {
    _Mgmt places() => _Mgmt(
          locations: const [
            CenterLocation(
              id: 'l2',
              name: 'Arena Parceira',
              type: 'partner',
              windows: [
                CenterWindow(weekdays: [6], start: '08:00', end: '12:00'),
              ],
            ),
            CenterLocation(
              id: 'l1',
              name: 'Sede Barra',
              isPrimary: true,
              address: 'Av. Lúcio Costa, 100',
            ),
            CenterLocation(id: 'l9', name: 'Fechado', status: 'archived'),
          ],
          courts: const [
            CenterCourt(id: 'q1', name: 'Quadra 1', locationId: 'l1'),
            CenterCourt(id: 'q2', name: 'Quadra 2', locationId: 'l1'),
            CenterCourt(
              id: 'q3',
              name: 'Quadra 3',
              locationId: 'l1',
              status: 'maintenance',
            ),
          ],
        );

    _Coach ownerAt() => _Coach(
          memberships: [_member()],
          sessions: [
            _session('k1_b'),
            // Outra turma na Quadra 1 no mesmo horário.
            _session(
              'k2_b',
              start: '19:30',
              coachUid: 'paula',
              extra: {
                'classId': 'k2',
                'className': 'BT Sábado',
                'courtId': 'q1',
                'courtName': 'Quadra 1',
              },
            ),
          ],
        );

    Future<void> openSheet(WidgetTester tester) async {
      await _tap(tester, find.byKey(const Key('center-coach-session-actions')));
      await _tap(tester, find.byKey(const Key('center-coach-action-location')));
    }

    testWidgets('conferências por local, motivo obrigatório e grava', (
      tester,
    ) async {
      final mgmt = places();
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_b',
        ownerAt(),
        mgmt,
      );
      await openSheet(tester);
      expect(find.byKey(const Key('center-location-sheet')), findsOneWidget);
      expect(find.text('Agora: Sede Barra · Quadra 2'), findsOneWidget);
      expect(find.byKey(const Key('center-location-l9')), findsNothing);
      expect(find.text('Escolha o novo local'), findsOneWidget);
      expect(
        _primaryOnPressed(tester, const Key('center-location-confirm')),
        isNull,
      );

      // Parceiro fora da janela contratada.
      await _tap(tester, find.byKey(const Key('center-location-l2')));
      expect(find.text('Janela contratada em Arena Parceira'), findsOneWidget);
      expect(find.text('fora de Sáb · 08:00–12:00'), findsOneWidget);
      expect(find.text('Mudar mesmo assim'), findsOneWidget);

      // Volta para a sede, Quadra 1 ocupada.
      await _tap(tester, find.byKey(const Key('center-location-l1')));
      expect(
        find.byKey(const Key('center-location-court-q3')),
        findsNothing,
        reason: 'quadra em manutenção fica de fora',
      );
      await _tap(tester, find.byKey(const Key('center-location-court-q1')));
      expect(find.text('Quadra 1 livre'), findsOneWidget);
      expect(find.text('ocupada por BT Sábado 19:30'), findsOneWidget);
      expect(find.text('Agenda do professor'), findsOneWidget);
      expect(find.text('livre 19:00–20:00'), findsOneWidget);

      // Sem motivo (ou curto demais) não grava.
      expect(
        _primaryOnPressed(tester, const Key('center-location-confirm')),
        isNull,
      );
      await _type(tester, const Key('center-location-reason'), 'ab');
      expect(
        _primaryOnPressed(tester, const Key('center-location-confirm')),
        isNull,
      );
      await _type(tester, const Key('center-location-reason'), 'Rede rasgada');
      await _tap(tester, find.byKey(const Key('center-location-confirm')));

      expect(mgmt.moves.single, {
        'session': 'k1_b',
        'location': 'l1',
        'court': 'q1',
        'reason': 'Rede rasgada',
      });
      expect(find.byKey(const Key('center-location-sheet')), findsNothing);
      expect(find.text('Local desta aula alterado.'), findsOneWidget);
    });

    testWidgets('quadra livre: conferências todas verdes', (tester) async {
      final mgmt = places();
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_b',
        ownerAt()..sessions = [_session('k1_b')],
        mgmt,
      );
      await openSheet(tester);
      await _tap(tester, find.byKey(const Key('center-location-court-q1')));
      expect(find.text('livre no horário'), findsOneWidget);
      expect(find.text('folga de 30 min respeitada'), findsOneWidget);
      expect(find.text('Mudar para Sede Barra'), findsOneWidget);
    });

    testWidgets('erro ao gravar mantém a folha aberta', (tester) async {
      final mgmt = places()
        ..failWith = const CenterCoachException('Aula já começou.');
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_b',
        ownerAt(),
        mgmt,
      );
      await openSheet(tester);
      await _tap(tester, find.byKey(const Key('center-location-court-q1')));
      await _type(tester, const Key('center-location-reason'), 'Chuva');
      await _tap(tester, find.byKey(const Key('center-location-confirm')));
      expect(find.byKey(const Key('center-location-sheet')), findsOneWidget);
      expect(find.text('Aula já começou.'), findsOneWidget);
      expect(mgmt.moves, isEmpty);
    });

    testWidgets('aula passada não oferece as ações', (tester) async {
      await _pump(
        tester,
        '/athlete/professor/centros/c1/aula/k1_old',
        ownerAt()..sessions = [_session('k1_old', date: '2026-10-21')],
        places(),
      );
      expect(
        find.byKey(const Key('center-coach-session-actions')),
        findsNothing,
      );
    });
  });

  // ── G19 · Modo Centro ───────────────────────────────────────────────────
  group('G19 · modo Centro', () {
    testWidgets('owner abre no Hoje; Mais leva à Equipe', (tester) async {
      final router = await _pump(
        tester,
        AppRoutes.centerHome,
        _Coach(memberships: [_member()]),
        _Mgmt(),
      );
      expect(find.byType(CenterCoachTodayPage), findsOneWidget);
      expect(find.byType(CenterCoachAgendaPage), findsNothing);

      await _tap(tester, find.byIcon(Icons.more_horiz_rounded).last);
      expect(find.byKey(const Key('center-more-team')), findsOneWidget);
      expect(find.byKey(const Key('center-more-enroll')), findsOneWidget);
      expect(find.byKey(const Key('center-more-checkin')), findsOneWidget);

      await _tap(tester, find.byKey(const Key('center-more-team')));
      expect(router.state.uri.path, _teamPath);
      expect(find.byKey(const Key('center-team-invite')), findsOneWidget);
    });

    testWidgets('recepção: sem Equipe, com Matricular', (tester) async {
      final router = await _pump(
        tester,
        AppRoutes.centerHome,
        _Coach(memberships: [_member(role: 'receptionist')]),
        _Mgmt(),
      );
      expect(find.byType(CenterCoachTodayPage), findsOneWidget);
      await _tap(tester, find.byIcon(Icons.more_horiz_rounded).last);
      expect(find.byKey(const Key('center-more-team')), findsNothing);
      expect(find.byKey(const Key('center-more-alerts')), findsNothing);
      expect(
        find.byKey(const Key('center-more-checkin')),
        findsNothing,
        reason: 'Check-in já está na barra da recepção',
      );
      await _tap(tester, find.byKey(const Key('center-more-enroll')));
      expect(router.state.uri.path, _enrollPath);
      expect(find.byKey(const Key('center-enroll-search')), findsOneWidget);
    });
  });
}
