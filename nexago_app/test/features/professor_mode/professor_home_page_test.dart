import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/auth/domain/role_selection_providers.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/application/professor_availability_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_evaluations_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_notices_providers.dart';
import 'package:nexago_app/features/professor_mode/application/professor_today_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/arena_professor_notices.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_home_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_agenda_test_support.dart';
import 'professor_availability_test_support.dart';
import 'professor_lesson_plans_test_support.dart';
import 'professor_notices_test_support.dart' show arenaNotice;

/// Instante UTC de [hour]:[minute] em SP no dia 20/10/2026 (SP = UTC−3).
DateTime _sp(int hour, [int minute = 0]) =>
    DateTime.utc(2026, 10, 20, hour + 3, minute);

Widget _stub(String label) => Scaffold(body: Center(child: Text(label)));

GoRoute _stubRoute(String path, String name, String label) => GoRoute(
      path: path,
      name: name,
      builder: (_, state) => _stub(
        [
          label,
          ...state.pathParameters.values,
          ...state.uri.queryParameters.values,
        ].join(' '),
      ),
    );

final _routes = <RouteBase>[
  GoRoute(
    path: AppRoutes.professorHome,
    name: AppRouteNames.professorHome,
    builder: (_, __) => const ProfessorHomePage(),
  ),
  _stubRoute(AppRoutes.professorMessages, AppRouteNames.professorMessages,
      'mensagens'),
  _stubRoute(AppRoutes.professorAvailability,
      AppRouteNames.professorAvailability, 'disponibilidade'),
  _stubRoute(AppRoutes.professorEvaluations, AppRouteNames.professorEvaluations,
      'avaliações'),
  _stubRoute(AppRoutes.professorLessonPlans, AppRouteNames.professorLessonPlans,
      'planos'),
  _stubRoute(AppRoutes.professorLessonPlanEditor,
      AppRouteNames.professorLessonPlanEditor, 'editor'),
  _stubRoute(AppRoutes.professorLessonLive, AppRouteNames.professorLessonLive,
      'modo aula'),
  _stubRoute(AppRoutes.professorLessonReview,
      AppRouteNames.professorLessonReview, 'registro'),
  _stubRoute(AppRoutes.professorNotices, AppRouteNames.professorNotices,
      'comunicados'),
  _stubRoute(AppRoutes.professorArenaNotice, AppRouteNames.professorArenaNotice,
      'comunicado da arena'),
  _stubRoute(AppRoutes.athleteNotifications, AppRouteNames.athleteNotifications,
      'notificações'),
  _stubRoute(AppRoutes.arenaSlots, AppRouteNames.arenaSlots, 'horários'),
];

Future<GoRouter> _pump(
  WidgetTester tester, {
  required DateTime now,
  List<ClassAgendaEntry> sessions = const [],
  FakeProfessorLessonPlansRepository? plans,
  List<PrivateLesson> privates = const [],
  int unreadMessages = 0,
  int unreadNotifications = 0,
  List<ArenaProfessorNotice> notices = const [],
  int evaluationsPending = 0,
  List<ArenaProfessorLink> links = const [],
}) {
  return pumpProfessorAgendaApp(
    tester,
    agenda: FakeProfessorAgendaRepository(sessions: List.of(sessions)),
    location: AppRoutes.professorHome,
    now: now,
    links: links,
    lessonPlans: plans,
    size: const Size(390, 2200),
    extraRoutes: _routes,
    extraOverrides: [
      professorPrivateLessonsProvider
          .overrideWith((ref) => Stream.value(privates)),
      professorTodayRefreshIntervalProvider.overrideWithValue(null),
      roleSelectionFirstNameProvider.overrideWithValue('Thiago'),
      athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
      athleteUnreadNotificationsCountProvider
          .overrideWith((ref) => unreadNotifications),
      unreadMessagesCountProvider.overrideWith((ref) => unreadMessages),
      arenaProfessorNoticesProvider
          .overrideWith((ref) => Stream.value(notices)),
      arenaProfessorNoticeReadProvider.overrideWith((ref, id) => false),
      evaluationPendingProvider.overrideWith((ref) => [
            for (var i = 0; i < evaluationsPending; i++)
              (athleteId: 'ev$i', name: 'Aluno $i', photoUrl: null),
          ]),
      hasMultipleMobileRolesProvider.overrideWithValue(true),
    ],
  );
}

/// Sem `pumpAndSettle`: o spinner de carregamento gira para sempre.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 400));
}

String _top(GoRouter router) =>
    router.routerDelegate.currentConfiguration.last.matchedLocation;

/// Dia do professor: 07:00 Arena Norte, 19:00 e 20:00 na CFC.
List<ClassAgendaEntry> _day() => [
      agendaSession(
        id: 's-am',
        arenaId: 'arena-norte',
        arenaName: 'Arena Norte',
        className: 'Manhã Norte',
        start: '07:00',
        end: '08:00',
        students: 3,
      ),
      agendaSession(
        id: 's1',
        className: 'Intermediário B',
        start: '19:00',
        end: '20:00',
        students: 6,
      ),
      agendaSession(
        id: 's2',
        classId: 'c2',
        className: 'Avançado Noite',
        start: '20:00',
        end: '21:00',
        students: 4,
      ),
    ];

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('saudação e cabeçalho', () {
    testWidgets('bom dia de manhã, com data e hora de SP', (tester) async {
      await _pump(tester, now: _sp(5, 20));
      expect(find.text('Bom dia, Thiago'), findsOneWidget);
      expect(find.text('TER, 20 OUT · 05:20'), findsOneWidget);
    });

    testWidgets('boa tarde à tarde', (tester) async {
      await _pump(tester, now: _sp(17, 40));
      expect(find.text('Boa tarde, Thiago'), findsOneWidget);
    });

    testWidgets('boa noite depois das 18h', (tester) async {
      await _pump(tester, now: _sp(21, 5));
      expect(find.text('Boa noite, Thiago'), findsOneWidget);
    });

    testWidgets('sino abre as notificações; avatar abre os ajustes',
        (tester) async {
      final router = await _pump(
        tester,
        now: _sp(12),
        unreadNotifications: 2,
      );
      expect(find.byKey(const Key('professor-home-bell-dot')), findsOneWidget);
      await tester.tap(find.byKey(const Key('professor-home-settings')));
      await _settle(tester);
      expect(find.byKey(const Key('professor-settings-switch-role')),
          findsOneWidget);
      Navigator.of(tester
              .element(find.byKey(const Key('professor-settings-switch-role'))))
          .pop();
      await _settle(tester);
      await tester.tap(find.byKey(const Key('professor-home-bell')));
      await _settle(tester);
      expect(_top(router), AppRoutes.athleteNotifications);
    });
  });

  group('Agora (J1)', () {
    testWidgets('começando em 20 min: arena, quadra, alunos e chamada',
        (tester) async {
      final router = await _pump(tester, now: _sp(18, 40), sessions: _day());
      expect(find.text('AGORA · FALTAM 20 MIN'), findsOneWidget);
      expect(find.text('ARENA CFC · QUADRA 2'), findsOneWidget);
      final now = find.byKey(const Key('professor-today-now'));
      expect(
        find.descendant(of: now, matching: find.text('Intermediário B')),
        findsOneWidget,
      );
      expect(find.text('Turma · 19:00–20:00 · 6 alunos'), findsOneWidget);
      expect(
          find.byKey(const Key('professor-today-now-progress')), findsNothing);
      // 1 de 3 feitas, 13 alunos no dia.
      expect(find.text('1/3'), findsOneWidget);
      expect(find.text('13'), findsOneWidget);

      await tester.tap(find.byKey(const Key('professor-today-now-attendance')));
      await _settle(tester);
      expect(find.text('chamada s1'), findsOneWidget);
      expect(router, isNotNull);
    });

    testWidgets('em andamento: barra de progresso e "Iniciar aula" do plano',
        (tester) async {
      final plans = FakeProfessorLessonPlansRepository(plans: [
        lessonPlan(refId: 's1', title: 'Intermediário B'),
      ]);
      await _pump(
        tester,
        now: _sp(19, 30),
        sessions: _day(),
        plans: plans,
      );
      expect(find.text('EM ANDAMENTO'), findsOneWidget);
      expect(find.byKey(const Key('professor-today-now-progress')),
          findsOneWidget);
      final bar = tester.widget<LinearProgressIndicator>(
          find.byKey(const Key('professor-today-now-progress')));
      expect(bar.value, closeTo(0.5, 0.001));

      await tester
          .tap(find.byKey(const Key('professor-today-now-startLesson')));
      await _settle(tester);
      expect(
        find.text(
            'modo aula ${lessonPlanId(lessonPlanUid, LessonPlanKind.session, 's1')}'),
        findsOneWidget,
      );
    });

    testWidgets('sem plano: "Planejar" abre o editor da aula', (tester) async {
      await _pump(tester, now: _sp(19, 30), sessions: _day());
      await tester.tap(find.byKey(const Key('professor-today-now-planLesson')));
      await _settle(tester);
      expect(find.text('editor session s1'), findsOneWidget);
    });

    testWidgets('próximas hoje: horário, quanto falta, tipo; toque abre',
        (tester) async {
      final router = await _pump(tester, now: _sp(18, 40), sessions: _day());
      expect(find.text('PRÓXIMAS HOJE'), findsOneWidget);
      final row = find.byKey(const Key('professor-today-next-session:s2'));
      expect(row, findsOneWidget);
      expect(find.descendant(of: row, matching: find.text('20:00')),
          findsOneWidget);
      expect(find.descendant(of: row, matching: find.text('EM 1H20')),
          findsOneWidget);
      expect(find.descendant(of: row, matching: find.text('Avançado Noite')),
          findsOneWidget);
      // A do "Agora" não se repete na lista.
      expect(find.byKey(const Key('professor-today-next-session:s1')),
          findsNothing);

      await tester.tap(row);
      await _settle(tester);
      expect(_top(router), '/professor/agenda/aula/s2');
    });

    testWidgets('"Ver agenda" vai para a aba Agenda', (tester) async {
      final router = await _pump(tester, now: _sp(18, 40), sessions: _day());
      await tester.tap(find.byKey(const Key('professor-today-see-agenda')));
      await _settle(tester);
      expect(_top(router), AppRoutes.professorAgenda);
    });
  });

  group('início do dia (J2)', () {
    testWidgets('nada agora: resumo do dia e a primeira aula', (tester) async {
      final router = await _pump(tester, now: _sp(5, 20), sessions: _day());
      expect(find.byKey(const Key('professor-today-now')), findsNothing);
      expect(find.text('3 aulas'), findsOneWidget);
      expect(find.text('07:00 às 21:00'), findsOneWidget);
      expect(find.text('PRIMEIRA AULA · EM 1H40'), findsOneWidget);
      // Faixa das horas: 07h ocupada, 10h livre.
      final strip7 = tester
          .widget<Container>(find.byKey(const Key('professor-today-strip-7')));
      final strip10 = tester
          .widget<Container>(find.byKey(const Key('professor-today-strip-10')));
      expect((strip7.decoration! as BoxDecoration).color,
          isNot((strip10.decoration! as BoxDecoration).color));

      await tester
          .tap(find.byKey(const Key('professor-today-first-session:s-am')));
      await _settle(tester);
      expect(_top(router), '/professor/agenda/aula/s-am');
    });

    testWidgets('entre aulas, a próxima (não a primeira)', (tester) async {
      await _pump(tester, now: _sp(12), sessions: _day());
      expect(find.text('PRÓXIMA AULA · EM 7H'), findsOneWidget);
    });

    testWidgets('sem aula hoje', (tester) async {
      await _pump(tester, now: _sp(12));
      expect(
          find.byKey(const Key('professor-home-no-classes')), findsOneWidget);
      expect(find.text('LINHA DO DIA'), findsNothing);
    });

    testWidgets('erro ao carregar não vira "nenhuma aula"', (tester) async {
      final agenda = FakeProfessorAgendaRepository()
        ..sessionsError = Exception('offline');
      await pumpProfessorAgendaApp(
        tester,
        agenda: agenda,
        location: AppRoutes.professorHome,
        now: _sp(12),
        extraRoutes: _routes,
        extraOverrides: [
          professorTodayRefreshIntervalProvider.overrideWithValue(null),
          roleSelectionFirstNameProvider.overrideWithValue('Thiago'),
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          athleteUnreadNotificationsCountProvider.overrideWith((ref) => 0),
          unreadMessagesCountProvider.overrideWith((ref) => 0),
          arenaProfessorNoticesProvider
              .overrideWith((ref) => Stream.value(const [])),
        ],
      );
      expect(find.byKey(const Key('professor-home-error')), findsOneWidget);
      expect(find.byKey(const Key('professor-home-no-classes')), findsNothing);
    });
  });

  group('linha do dia', () {
    testWidgets('todas as arenas, com deslocamento e AGORA', (tester) async {
      await _pump(tester, now: _sp(19, 30), sessions: _day());
      expect(find.text('LINHA DO DIA'), findsOneWidget);
      final timeline = find.byKey(const Key('professor-today-timeline'));
      for (final id in ['s-am', 's1', 's2']) {
        expect(
          find.descendant(
            of: timeline,
            matching: find.byKey(Key('professor-today-line-session:$id')),
          ),
          findsOneWidget,
        );
      }
      expect(find.byKey(const Key('professor-today-travel-Arena CFC')),
          findsOneWidget);
      expect(find.descendant(of: timeline, matching: find.text('AGORA')),
          findsOneWidget);
    });

    testWidgets('cancelada aparece riscada e toque abre o detalhe',
        (tester) async {
      final router = await _pump(
        tester,
        now: _sp(5, 20),
        sessions: [
          ..._day(),
          agendaSession(
            id: 's-x',
            className: 'Cancelada',
            start: '09:00',
            end: '10:00',
            status: 'canceled',
          ),
        ],
      );
      expect(find.text('CANCELADA'), findsOneWidget);
      // Cancelada não conta no resumo.
      expect(find.text('3 aulas'), findsOneWidget);
      await tester.ensureVisible(
          find.byKey(const Key('professor-today-line-session:s2')));
      await tester
          .tap(find.byKey(const Key('professor-today-line-session:s2')));
      await _settle(tester);
      expect(_top(router), '/professor/agenda/aula/s2');
    });
  });

  group('pendências', () {
    testWidgets('sem nenhuma contagem, sem a seção', (tester) async {
      await _pump(tester, now: _sp(18, 40));
      expect(find.byKey(const Key('professor-today-pendings')), findsNothing);
    });

    testWidgets('só as fontes com contagem viram linha', (tester) async {
      final privates = [
        privateLesson(
          id: 'req',
          athleteName: 'João Pedro',
          status: 'pending',
          startAt: spInstant(22, 10),
        ),
        privateLesson(
          id: 'rs',
          athleteName: 'Paulo Viana',
          startAt: spInstant(22, 6),
          reschedule: {
            'requestedBy': 'ath-1',
            'startAt': spInstant(22, 7),
            'status': 'pending',
          },
        ),
      ];
      final plans = FakeProfessorLessonPlansRepository(plans: [
        lessonPlan(refId: 'class_c1_2026-10-18', date: '2026-10-18'),
      ]);
      await _pump(
        tester,
        now: _sp(18, 40),
        sessions: [
          ..._day(),
          agendaSession(id: 'past', date: '2026-10-18', className: 'Sábado'),
        ],
        plans: plans,
        privates: privates,
        unreadMessages: 3,
        evaluationsPending: 2,
        notices: [arenaNotice(arenaName: 'Arena Sul')],
      );
      final card = find.byKey(const Key('professor-today-pendings'));
      expect(card, findsOneWidget);
      expect(find.text('PRECISA DE VOCÊ · 8'), findsOneWidget);
      expect(find.text('Chamada pendente · Sábado'), findsOneWidget);
      expect(find.text('João P. pediu uma particular'), findsOneWidget);
      expect(find.text('Paulo V. pediu para remarcar'), findsOneWidget);
      expect(find.text('De Qui 22 · 06:00 para Qui 22 · 07:00'), findsOneWidget);
      expect(find.text('3 mensagens não lidas'), findsOneWidget);
      // 19:00 e 20:00 ainda vêm e não têm plano (a das 07:00 já passou).
      expect(find.text('2 aulas hoje sem plano'), findsOneWidget);
      expect(find.text('1 aula para registrar'), findsOneWidget);
      expect(find.text('2 alunos para avaliar'), findsOneWidget);
      expect(find.text('Comunicado da Arena Sul'), findsOneWidget);
    });

    testWidgets('toques levam a cada lugar', (tester) async {
      final privates = [
        privateLesson(
          id: 'req',
          status: 'pending',
          startAt: spInstant(22, 10),
        ),
      ];
      final plans = FakeProfessorLessonPlansRepository(plans: [
        lessonPlan(refId: 'class_c1_2026-10-18', date: '2026-10-18'),
      ]);
      final router = await _pump(
        tester,
        now: _sp(18, 40),
        sessions: [agendaSession(id: 'past', date: '2026-10-18')],
        plans: plans,
        privates: privates,
        unreadMessages: 1,
        evaluationsPending: 1,
        notices: [arenaNotice(id: 'an7')],
      );

      Future<void> tapRow(String kind) async {
        final row = find.byKey(Key('professor-today-pending-$kind'));
        await tester.ensureVisible(row);
        await tester.tap(row);
        await _settle(tester);
      }

      Future<void> back() async {
        router.pop();
        await _settle(tester);
      }

      await tapRow('attendance');
      expect(find.text('chamada past'), findsOneWidget);
      await back();

      await tapRow('privateRequest');
      expect(find.text('disponibilidade'), findsOneWidget);
      await back();

      await tapRow('review');
      expect(
        find.text(
            'registro ${lessonPlanId(lessonPlanUid, LessonPlanKind.session, 'class_c1_2026-10-18')}'),
        findsOneWidget,
      );
      await back();

      await tapRow('evaluations');
      expect(find.text('avaliações'), findsOneWidget);
      await back();

      await tapRow('arenaNotice');
      expect(find.text('comunicado da arena an7'), findsOneWidget);
      await back();

      await tapRow('messages');
      expect(_top(router), AppRoutes.professorMessages);
    });
  });

  testWidgets('reservar e Minhas arenas continuam no Hoje', (tester) async {
    final router = await _pump(
      tester,
      now: _sp(12),
      links: [
        ArenaProfessorLink(
          id: 'a2_u1',
          arenaId: 'a2',
          professorUserId: 'u1',
          type: ArenaProfessorLinkType.independent,
          status: ArenaProfessorLinkStatus.active,
          arenaName: 'Arena Norte',
          permissions: ArenaProfessorPermissions(
            canManageOwnLessons: true,
            canBookCourts: true,
            canAppearInArenaProfile: false,
          ),
        ),
      ],
    );
    await tester.ensureVisible(find.byKey(const Key('professor-book-a2')));
    await tester.tap(find.byKey(const Key('professor-book-a2')));
    await _settle(tester);
    expect(find.text('horários a2'), findsOneWidget);
    router.pop();
    await _settle(tester);
    await tester
        .ensureVisible(find.byKey(const Key('professor-home-my-arenas')));
    await tester.tap(find.byKey(const Key('professor-home-my-arenas')));
    await _settle(tester);
    expect(find.text('minhas arenas'), findsOneWidget);
  });
}
