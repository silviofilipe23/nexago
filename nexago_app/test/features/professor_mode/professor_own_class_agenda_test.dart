import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lesson_plans.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lessons.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_own_classes.dart';
import 'package:nexago_app/features/professor_mode/presentation/own_classes/professor_own_class_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_agenda_test_support.dart';
import 'professor_lesson_plans_test_support.dart';
import 'professor_own_classes_test_support.dart';
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

/// Turma própria na agenda, no plano de aula e a situação das séries
/// (`seriesStatus`) no detalhe e no cartão. Hoje = Ter 20/10/2026 12:00 SP.

ProfessorCourtBooking ownBooking({
  String id = 'ob-1',
  String date = '2026-10-22',
  String start = '07:00',
  String end = '08:00',
  String status = 'active',
  String? classId = 'oc-1',
}) =>
    ProfessorCourtBooking(
      id: id,
      date: date,
      startTime: start,
      endTime: end,
      amountReais: 60,
      status: status,
      arenaName: 'Arena Norte',
      arenaId: ownArenaId,
      courtName: 'Quadra 1',
      professorClassId: classId,
    );

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

/// Só o detalhe da turma própria (as rotas da carteira já vêm com a agenda).
List<RouteBase> get _ownClassDetailRoute => [
      GoRoute(
        path: AppRoutes.professorOwnClass,
        name: AppRouteNames.professorOwnClass,
        builder: (_, state) => ProfessorOwnClassPage(
          classId: state.pathParameters['classId'] ?? '',
        ),
      ),
    ];

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('agenda: ocorrências da turma própria', () {
    List<ProfessorAgendaItem> build(
      List<ProfessorCourtBooking> bookings, {
      List<ProfessorLesson> lessons = const [],
    }) =>
        buildProfessorAgendaItems(
          sessions: const [],
          lessons: lessons,
          bookingStatus: const {},
          blocks: const [],
          courtBookings: bookings,
          ownClassNames: const {'oc-1': 'Manhã Intermediário'},
        );

    test('vira item com nome da turma, tipo e quadra · arena', () {
      final items = build([ownBooking()]);
      final i = items.single;
      expect(i.id, 'own:ob-1');
      expect(i.kind, ProfessorAgendaKind.ownClass);
      expect(i.title, 'Manhã Intermediário');
      expect(i.typeLabel, 'Turma própria');
      expect(i.place, 'Quadra 1 · Arena Norte');
      expect(i.arenaId, ownArenaId);
      expect((i.startMin, i.endMin), (7 * 60, 8 * 60));
      expect(i.ownClassId, 'oc-1');
    });

    test('cancelada fica de fora; reserva comum não vira item', () {
      final items = build([
        ownBooking(id: 'ob-x', status: 'canceled'),
        ownBooking(id: 'avulsa', classId: null),
        ownBooking(id: 'ob-2', date: '2026-10-27'),
      ]);
      expect(items.map((i) => i.id), ['own:ob-2']);
    });

    test('sem duplicar: reserva repetida ou que já é aula da carteira', () {
      final items = build(
        [ownBooking(), ownBooking(), ownBooking(id: 'bk-1')],
        lessons: [walletLesson(bookingId: 'bk-1')],
      );
      expect(items.where((i) => i.kind == ProfessorAgendaKind.ownClass),
          hasLength(1));
      expect(items.map((i) => i.id), containsAll(['own:ob-1', 'lesson:bk-1']));
    });

    test('nome desconhecido: "Turma própria"', () {
      final i = buildProfessorAgendaItems(
        sessions: const [],
        lessons: const [],
        bookingStatus: const {},
        blocks: const [],
        courtBookings: [ownBooking(classId: 'oc-9')],
      ).single;
      expect(i.title, 'Turma própria');
    });

    testWidgets('aparece no Dia e o toque abre o detalhe da turma',
        (tester) async {
      final router = await pumpProfessorAgendaApp(
        tester,
        agenda: FakeProfessorAgendaRepository(),
        wallet: FakeProfessorWalletRepository(bookings: [
          ownBooking(date: '2026-10-20', start: '18:00', end: '19:00'),
          ownBooking(id: 'ob-x', date: '2026-10-20', status: 'canceled'),
        ]),
        ownClasses: FakeProfessorOwnClassesRepository(classes: [ownClass()]),
        extraRoutes: _ownClassDetailRoute,
        location: AppRoutes.professorAgenda,
      );

      final item = find.byKey(const Key('professor-agenda-item-own:ob-1'));
      expect(item, findsOneWidget);
      expect(find.byKey(const Key('professor-agenda-item-own:ob-x')),
          findsNothing);
      expect(
        find.descendant(of: item, matching: find.text('Manhã Intermediário')),
        findsOneWidget,
      );

      await tap(tester, item);
      expect(
        router.state.uri.path,
        AppRoutes.professorOwnClass.replaceAll(':classId', 'oc-1'),
      );
      expect(
          find.byKey(const Key('professor-own-class-series')), findsOneWidget);
    });
  });

  group('plano de aula da turma própria', () {
    test('plannable com kind booking e a turma', () {
      final items = buildProfessorAgendaItems(
        sessions: const [],
        lessons: const [],
        bookingStatus: const {},
        blocks: const [],
        courtBookings: [ownBooking()],
      );
      final l = plannableLessonsFrom(
        items,
        fromKey: '2026-10-20',
        toKey: '2026-10-26',
      ).single;
      expect(l.kind, LessonPlanKind.booking);
      expect(l.refId, 'ob-1');
      expect(l.classId, 'oc-1');
      expect(l.planId('u'), 'u_booking_ob-1');
    });

    test('"Repetir anterior" acha o plano de outra reserva da mesma turma', () {
      const lesson = PlannableLesson(
        kind: LessonPlanKind.booking,
        refId: 'ob-1',
        classId: 'oc-1',
        date: '2026-10-22',
        startMin: 420,
        endMin: 480,
        title: 'Manhã Intermediário',
        typeLabel: 'Turma própria',
      );
      final plans = [
        lessonPlan(
            kind: LessonPlanKind.booking, refId: 'ob-old', date: '2026-10-15'),
        lessonPlan(
            kind: LessonPlanKind.booking,
            refId: 'outra-turma',
            date: '2026-10-20'),
        // Plano de turma da arena não conta.
        lessonPlan(refId: 'class_oc-1_2026-10-20'),
      ];
      final prev = previousLessonPlanFor(
        lesson,
        plans,
        bookingClassIds: const {'ob-old': 'oc-1', 'outra-turma': 'oc-2'},
      );
      expect(prev?.refId, 'ob-old');
      // Sem saber a turma da reserva: nada.
      expect(previousLessonPlanFor(lesson, plans), isNull);
    });

    testWidgets('H1 lista a ocorrência; Repetir anterior grava kind booking',
        (tester) async {
      final repo = FakeProfessorLessonPlansRepository(plans: [
        lessonPlan(
          kind: LessonPlanKind.booking,
          refId: 'ob-old',
          date: '2026-10-15',
          title: 'Manhã Intermediário',
        ),
      ]);
      final router = await pumpLessonPlansApp(
        tester,
        plans: repo,
        sessions: const [],
        wallet: FakeProfessorWalletRepository(bookings: [
          ownBooking(id: 'ob-old', date: '2026-10-15'),
          ownBooking(),
          ownBooking(id: 'ob-x', date: '2026-10-21', status: 'canceled'),
        ]),
        ownClasses: FakeProfessorOwnClassesRepository(classes: [ownClass()]),
      );

      expect(find.byKey(const Key('lesson-plan-row-ob-1')), findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-row-ob-x')), findsNothing);
      expect(
        tester
            .widget<Text>(find.byKey(const Key('lesson-plan-status-ob-1')))
            .data,
        'SEM PLANO',
      );

      await tap(tester, find.byKey(const Key('lesson-plan-repeat-ob-1')));
      expect(router.state.uri.queryParameters['kind'], 'booking');
      expect(router.state.uri.queryParameters['refId'], 'ob-1');

      await tap(tester, find.byKey(const Key('lesson-plan-save')));
      final p = repo.savedPlans.single.toPayload();
      expect(p['kind'], 'booking');
      expect(p['refId'], 'ob-1');
    });
  });

  group('seriesStatus da turma própria', () {
    test('lê o mapa por dia; ausente = ativo', () {
      final c = ProfessorOwnClass.fromMap('oc-1', {
        'name': 'Manhã',
        'weekdays': [2, 4, 6],
        'seriesStatus': {'2': 'paused', '4': 'canceled', '9': 'paused'},
      });
      expect(c.seriesStatusOf(2), ProfessorOwnClassSeriesStatus.paused);
      expect(c.seriesStatusOf(4), ProfessorOwnClassSeriesStatus.canceled);
      expect(c.seriesStatusOf(6), ProfessorOwnClassSeriesStatus.active);
      expect(c.seriesStatus.keys, isNot(contains(9)));
      expect(
        professorOwnClassSeriesLabel(2, ProfessorOwnClassSeriesStatus.paused),
        'Ter · pausado pela arena',
      );
      expect(
        professorOwnClassSeriesLabel(4, ProfessorOwnClassSeriesStatus.active),
        'Qui · ativo',
      );
    });

    test('selo: PARCIAL, PAUSADA ou nenhum', () {
      ProfessorOwnClass withStatus(
        Map<int, ProfessorOwnClassSeriesStatus> s, {
        ProfessorOwnClassStatus status = ProfessorOwnClassStatus.active,
      }) =>
          ProfessorOwnClass(
            id: 'oc-1',
            name: 'Manhã',
            arenaId: ownArenaId,
            arenaName: 'Arena Norte',
            courtId: 'q1',
            courtName: 'Quadra 1',
            weekdays: const [2, 4],
            startTime: '07:00',
            endTime: '08:00',
            capacity: 4,
            monthlyPriceReais: 260,
            status: status,
            seriesStatus: s,
          );
      expect(professorOwnClassSeriesTag(withStatus(const {})), isNull);
      expect(
        professorOwnClassSeriesTag(withStatus(const {
          2: ProfessorOwnClassSeriesStatus.paused,
        })),
        'PARCIAL',
      );
      expect(
        professorOwnClassSeriesTag(withStatus(const {
          2: ProfessorOwnClassSeriesStatus.paused,
          4: ProfessorOwnClassSeriesStatus.canceled,
        })),
        'PAUSADA',
      );
      expect(
        professorOwnClassSeriesTag(withStatus(
          const {2: ProfessorOwnClassSeriesStatus.canceled},
          status: ProfessorOwnClassStatus.ended,
        )),
        isNull,
      );
    });

    test(
        'próxima ocorrência: pula canceladas, as já terminadas e outras turmas',
        () {
      final next = professorOwnClassNextBooking(
        [
          ownBooking(id: 'hoje-cedo', date: '2026-10-20'),
          ownBooking(id: 'cancelada', date: '2026-10-21', status: 'canceled'),
          ownBooking(id: 'outra', date: '2026-10-21', classId: 'oc-2'),
          ownBooking(id: 'quinta'),
          ownBooking(id: 'terca', date: '2026-10-27'),
        ],
        classId: 'oc-1',
        todayKey: '2026-10-20',
        nowMin: 12 * 60,
      );
      expect(next?.id, 'quinta');
    });

    testWidgets('detalhe: chips por dia e o plano da próxima aula',
        (tester) async {
      final cls = ProfessorOwnClass.fromMap('oc-1', {
        'name': 'Manhã Intermediário',
        'arenaId': ownArenaId,
        'arenaName': 'Arena Norte',
        'courtName': 'Quadra 1',
        'weekdays': [2, 4],
        'startTime': '07:00',
        'endTime': '08:00',
        'capacity': 4,
        'monthlyPriceReais': 260,
        'seriesStatus': {'4': 'paused'},
      });
      await pumpLessonPlansApp(
        tester,
        plans: FakeProfessorLessonPlansRepository(),
        sessions: const [],
        wallet: FakeProfessorWalletRepository(bookings: [ownBooking()]),
        ownClasses: FakeProfessorOwnClassesRepository(classes: [cls]),
        extraRoutes: _ownClassDetailRoute,
        location: AppRoutes.professorOwnClass.replaceAll(':classId', 'oc-1'),
      );

      expect(
        find.descendant(
          of: find.byKey(const Key('professor-own-class-series-2')),
          matching: find.text('Ter · ativo'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('professor-own-class-series-4')),
          matching: find.text('Qui · pausado pela arena'),
        ),
        findsOneWidget,
      );
      expect(find.text('Próxima aula · Qui 22 · 07:00'), findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-agenda-card')), findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-agenda-empty')), findsOneWidget);
      expect(find.byKey(const Key('professor-own-class-ended-note')),
          findsNothing);
    });

    testWidgets('encerrada pela arena: aviso e sem plano', (tester) async {
      final cls = ProfessorOwnClass.fromMap('oc-1', {
        'name': 'Manhã Intermediário',
        'arenaName': 'Arena Norte',
        'weekdays': [2, 4],
        'startTime': '07:00',
        'endTime': '08:00',
        'status': 'ended',
        'endedReason': 'arena_canceled',
        'seriesStatus': {'2': 'canceled', '4': 'canceled'},
      });
      await pumpOwnClassesApp(
        tester,
        repo: FakeProfessorOwnClassesRepository(classes: [cls]),
        location: AppRoutes.professorOwnClass.replaceAll(':classId', 'oc-1'),
      );

      expect(find.text('A arena cancelou o horário fixo desta turma.'),
          findsOneWidget);
      expect(find.text('Ter · cancelado pela arena'), findsOneWidget);
      expect(find.text('Qui · cancelado pela arena'), findsOneWidget);
      expect(find.byKey(const Key('lesson-plan-agenda-card')), findsNothing);
      expect(find.byKey(const Key('professor-own-class-end')), findsNothing);
    });

    testWidgets('Minhas turmas: selo PARCIAL / PAUSADA no cartão',
        (tester) async {
      ProfessorOwnClass cls(String id, Map<String, String> series) =>
          ProfessorOwnClass.fromMap(id, {
            'name': 'Turma $id',
            'arenaName': 'Arena Norte',
            'weekdays': [2, 4],
            'startTime': '07:00',
            'endTime': '08:00',
            'capacity': 4,
            'seriesStatus': series,
          });
      await pumpOwnClassesApp(
        tester,
        repo: FakeProfessorOwnClassesRepository(classes: [
          cls('a', const {}),
          cls('b', const {'2': 'paused'}),
          cls('c', const {'2': 'paused', '4': 'paused'}),
        ]),
        location: AppRoutes.professorClasses,
      );

      expect(find.byKey(const Key('professor-own-class-series-tag-a')),
          findsNothing);
      expect(
        find.descendant(
          of: find.byKey(const Key('professor-own-class-series-tag-b')),
          matching: find.text('PARCIAL'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('professor-own-class-series-tag-c')),
          matching: find.text('PAUSADA'),
        ),
        findsOneWidget,
      );
    });
  });
}
