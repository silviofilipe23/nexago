import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/role_route_guard.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_availability.dart';
import 'package:nexago_app/features/professor_mode/infrastructure/professor_agenda_repository.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_agenda_test_support.dart'
    show FakeProfessorAgendaRepository, agendaBlock;
import 'professor_availability_test_support.dart';
import 'professor_students_test_support.dart';

Future<void> tap(WidgetTester tester, Finder f) async {
  // `ensureVisible` rola o item para o topo: o que ficou acima pode ter
  // saído da árvore (lista preguiçosa) — volta rolando até ele.
  if (f.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      f,
      -300,
      scrollable: find.byType(Scrollable).first,
    );
  }
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

Future<GoRouter> pump(
  WidgetTester tester, {
  required FakeProfessorAvailabilityRepository repo,
  required String location,
  FakeProfessorAgendaRepository? agenda,
  List<MyProfessor> professors = const [],
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
      availabilityRepo: repo,
      location: location,
      extraRoutes: professorAvailabilityRoutes,
      overrides: [
        professorLinksClockProvider.overrideWithValue(() => availabilityNow),
        professorAgendaRepositoryProvider
            .overrideWithValue(agenda ?? FakeProfessorAgendaRepository()),
        myProfessorsProvider.overrideWith((ref) async => professors),
      ],
    );

String bookPath(String uid) =>
    AppRoutes.athletePrivateLessonBook.replaceAll(':professorUid', uid);

String slotKey(DateTime t) => 'private-book-slot-${t.toIso8601String()}';

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('domínio', () {
    test('disponibilidade: leitura, padrões, alternar e payload', () {
      final empty = ProfessorAvailability.fromMap(const {});
      expect(empty.openCount, 0);
      expect(empty.durationMin, 60);
      expect(empty.minNoticeHours, 4);
      expect(empty.freeCancelHours, 12);
      expect(empty.autoConfirm, isTrue);
      expect(empty.acceptPairs, isFalse);
      expect(empty.showOnProfile, isTrue);

      final a = ProfessorAvailability.fromMap(const {
        'weekly': {
          '1': [9, 8, 5, 22, 8],
          '3': [18],
        },
        'durationMin': 45,
        'minNoticeHours': 2,
        'freeCancelHours': 200,
        'autoConfirm': false,
        'acceptPairs': true,
        'published': true,
      });
      expect(a.weekly[1], {8, 9});
      expect(a.durationMin, 60);
      expect(a.freeCancelHours, 72);
      expect(a.isOpen(3, 18), isTrue);

      final b = a.toggle(1, 8).toggle(7, 21);
      expect(b.isOpen(1, 8), isFalse);
      expect(b.isOpen(7, 21), isTrue);
      expect(a.isOpen(1, 8), isTrue, reason: 'imutável');
      expect(b.toPayload(), {
        'weekly': {
          '1': [9],
          '2': <int>[],
          '3': [18],
          '4': <int>[],
          '5': <int>[],
          '6': <int>[],
          '7': [21],
        },
        'durationMin': 60,
        'minNoticeHours': 2,
        'freeCancelHours': 72,
        'autoConfirm': false,
        'acceptPairs': true,
        'showOnProfile': true,
        'published': true,
      });
      expect(availabilityDurationLabel(90), '1h30');
      expect(availabilityDurationLabel(30), '30 min');
      expect(availabilityOptionsWith(const [0, 4], 3), [0, 3, 4]);
    });

    test('particular: leitura, nomes, prazos e divisão', () {
      final l = privateLesson(status: 'pending', pair: true, note: 'Saque');
      expect(l.status, PrivateLessonStatus.pending);
      expect(l.isActive, isTrue);
      expect(l.dateKey, '2026-10-21');
      expect(l.pair, isTrue);
      expect(privateLessonShortName('Sofia Ramos Lima'), 'Sofia L.');
      expect(privateLessonShortName('Ana'), 'Ana');
      expect(privateLessonWhenLabel(l.startAt, '2026-10-20'), 'Amanhã · 10:00');
      expect(privateLessonCancelPolicy(12),
          'Cancelamento sem custo até 12h antes');
      expect(PrivateLesson.fromMap('x', const {}), isNull);

      final confirmed = privateLesson();
      // 22h antes do início.
      expect(
        privateLessonIsLateCancel(confirmed,
            now: availabilityNow, freeCancelHours: 24),
        isTrue,
      );
      expect(
        privateLessonIsLateCancel(confirmed,
            now: availabilityNow, freeCancelHours: 12),
        isFalse,
      );
      expect(
        privateLessonIsLateCancel(l, now: availabilityNow, freeCancelHours: 24),
        isFalse,
        reason: 'pendente não tem custo',
      );

      final split = splitPrivateLessons([
        privateLesson(id: 'past', startAt: spInstant(19, 9)),
        privateLesson(id: 'later', startAt: spInstant(23, 9)),
        privateLesson(id: 'soon', startAt: spInstant(21, 9)),
      ], availabilityNow);
      expect(split.upcoming.map((e) => e.id), ['soon', 'later']);
      expect(split.past.map((e) => e.id), ['past']);
    });

    test('horários livres: leitura, por dia e payload do pedido', () {
      final info = ProfessorOpenSlots.fromMap({
        'durationMin': 90,
        'acceptPairs': true,
        'autoConfirm': false,
        'freeCancelHours': 6,
        'slots': [
          {
            'startAt': '2026-10-22T21:00:00.000Z',
            'endAt': '2026-10-22T22:30:00.000Z'
          },
          {
            'startAt': '2026-10-21T12:00:00.000Z',
            'endAt': '2026-10-21T13:30:00.000Z'
          },
          {'startAt': 'x'},
          {
            'startAt': '2026-10-21T13:00:00.000Z',
            'endAt': '2026-10-21T14:30:00.000Z'
          },
        ],
      });
      expect(info.slots.length, 3);
      final days = groupOpenSlotsByDay(info.slots);
      expect(days.map((d) => d.dateKey), ['2026-10-21', '2026-10-22']);
      expect(days.first.slots.map((s) => s.timeLabel), ['09:00', '10:00']);
      expect(days.last.slots.single.timeLabel, '18:00');

      expect(
        PrivateLessonRequest(
          professorUid: 'prof-x',
          startAt: DateTime.utc(2026, 10, 21, 12),
          pair: true,
          note: '  Saque  ',
        ).toPayload(),
        {
          'professorUid': 'prof-x',
          'startAt': '2026-10-21T12:00:00.000Z',
          'pair': true,
          'note': 'Saque',
        },
      );
      expect(
        PrivateLessonRequest(
          professorUid: 'p',
          startAt: DateTime.utc(2026, 10, 21, 12),
        ).toPayload().containsKey('note'),
        isFalse,
      );
    });

    test('grade: turma, particular e bloqueio por cima, só leitura', () {
      final availability = ProfessorAvailability.fromMap(const {
        'weekly': {
          '2': [8, 19],
          '3': [10, 11],
          '5': [14],
        },
      });
      final classes = professorStudentsSnapshot().classes;
      final tue = availabilityDayCells(
        availability: availability,
        weekday: 2,
        dateKey: '2026-10-20',
        classes: classes,
      );
      expect(tue.length, 16);
      final at8 = tue.firstWhere((c) => c.hour == 8);
      expect(at8.state, AvailabilityCellState.open);
      expect(at8.label, 'Livre');
      expect(tue.firstWhere((c) => c.hour == 9).label, 'Fechado');
      final at19 = tue.firstWhere((c) => c.hour == 19);
      expect(at19.state, AvailabilityCellState.fixedClass);
      expect(at19.label, 'Iniciante A');
      expect(at19.toggleable, isFalse);

      final wed = availabilityDayCells(
        availability: availability,
        weekday: 3,
        dateKey: '2026-10-21',
        lessons: [
          privateLesson(durationMin: 90),
          privateLesson(
              id: 'gone', status: 'canceled', startAt: spInstant(21, 11)),
        ],
      );
      expect(wed.firstWhere((c) => c.hour == 10).state,
          AvailabilityCellState.booked);
      expect(wed.firstWhere((c) => c.hour == 10).label, 'Sofia R.');
      expect(wed.firstWhere((c) => c.hour == 11).state,
          AvailabilityCellState.booked,
          reason: '90 min ocupam as 11h também');

      final fri = availabilityDayCells(
        availability: availability,
        weekday: 5,
        dateKey: '2026-10-23',
        blocks: [agendaBlock()],
      );
      expect(
        [
          for (final c in fri)
            if (c.state == AvailabilityCellState.blocked) c.hour
        ],
        [14, 15, 16, 17],
      );
      expect(fri.firstWhere((c) => c.hour == 14).label, 'Torneio');
    });

    test('agenda: só a particular confirmada entra, como "Particular · aluno"',
        () {
      final items = buildProfessorAgendaItems(
        sessions: const [],
        lessons: const [],
        bookingStatus: const {},
        blocks: const [],
        privateLessons: [
          privateLesson(pair: true),
          privateLesson(id: 'p2', status: 'pending'),
        ],
      );
      expect(items.length, 1);
      final i = items.single;
      expect(i.kind, ProfessorAgendaKind.privateLesson);
      expect(i.title, 'Particular · Sofia R.');
      expect(i.typeLabel, 'Dupla');
      expect(i.date, '2026-10-21');
      expect(i.startLabel, '10:00');
      expect(i.endLabel, '11:00');
    });
  });

  group('professor (A10)', () {
    testWidgets('sem documento: tudo fechado; alternar e publicar',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository();
      await pump(tester, repo: repo, location: AppRoutes.professorAvailability);

      expect(find.text('Disponibilidade'), findsOneWidget);
      expect(find.text('PARTICULARES NO APP'), findsOneWidget);
      // Terça (hoje) escolhida; 8h fechada.
      expect(
          inside('availability-cell-8', find.text('Fechado')), findsOneWidget);
      expect(inside('availability-cell-19', find.text('Iniciante A')),
          findsOneWidget);

      await tap(tester, find.byKey(const Key('availability-cell-8')));
      expect(inside('availability-cell-8', find.text('Livre')), findsOneWidget);
      await tap(tester, find.byKey(const Key('availability-cell-9')));
      await tap(tester, find.byKey(const Key('availability-cell-9')));
      expect(
          inside('availability-cell-9', find.text('Fechado')), findsOneWidget);
      // Turma não alterna.
      await tap(tester, find.byKey(const Key('availability-cell-19')));

      await tap(tester, find.byKey(const Key('availability-day-6')));
      await tap(tester, find.byKey(const Key('availability-cell-10')));

      await tap(tester, find.byKey(const Key('availability-duration-90')));
      await tap(tester, find.byKey(const Key('availability-notice-24')));
      await tap(
          tester, inside('availability-accept-pairs', find.byType(Switch)));

      await tap(tester, find.byKey(const Key('availability-publish')));
      expect(repo.saved.single, {
        'weekly': {
          '1': <int>[],
          '2': [8],
          '3': <int>[],
          '4': <int>[],
          '5': <int>[],
          '6': [10],
          '7': <int>[],
        },
        'durationMin': 90,
        'minNoticeHours': 24,
        'freeCancelHours': 12,
        'autoConfirm': true,
        'acceptPairs': true,
        'showOnProfile': true,
        'published': true,
      });
      expect(find.text('Horários publicados. Seus alunos já podem agendar.'),
          findsOneWidget);
    });

    testWidgets('carrega o documento e mostra particular e bloqueio',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(
        availability: {
          professorStudentsTestUid: ProfessorAvailability.fromMap(const {
            'weekly': {
              '3': [10, 12],
            },
            'freeCancelHours': 24,
          }),
        },
        lessons: [privateLesson()],
      );
      await pump(
        tester,
        repo: repo,
        location: AppRoutes.professorAvailability,
        agenda: FakeProfessorAgendaRepository(blocks: [agendaBlock()]),
      );

      // Próximas particulares (confirmada).
      expect(
          find.byKey(const Key('availability-upcoming-pl1')), findsOneWidget);

      await tap(tester, find.byKey(const Key('availability-day-3')));
      expect(inside('availability-cell-10', find.text('Sofia R.')),
          findsOneWidget);
      expect(
          inside('availability-cell-12', find.text('Livre')), findsOneWidget);
      // Particular é só leitura: o toque não fecha a hora.
      await tap(tester, find.byKey(const Key('availability-cell-10')));

      await tap(tester, find.byKey(const Key('availability-day-5')));
      expect(
          inside('availability-cell-15', find.text('Torneio')), findsOneWidget);

      await tap(tester, find.byKey(const Key('availability-publish')));
      final weekly = repo.saved.single['weekly']! as Map;
      expect(weekly['3'], [10, 12]);
      expect(repo.saved.single['freeCancelHours'], 24);
    });

    testWidgets('pedido pendente: aceitar move para as próximas',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(lessons: [
        privateLesson(
            status: 'pending', pair: true, note: 'Quero treinar saque'),
      ]);
      await pump(tester, repo: repo, location: AppRoutes.professorAvailability);

      expect(find.text('PEDIDOS · 1'), findsOneWidget);
      expect(inside('availability-request-pl1', find.text('EM DUPLA')),
          findsOneWidget);
      expect(
        inside('availability-request-pl1',
            find.textContaining('Quero treinar saque')),
        findsOneWidget,
      );

      await tap(tester, find.byKey(const Key('availability-accept-pl1')));
      expect(repo.responses.single, (lessonId: 'pl1', accept: true));
      expect(find.byKey(const Key('availability-request-pl1')), findsNothing);
      expect(
          find.byKey(const Key('availability-upcoming-pl1')), findsOneWidget);
      expect(find.text('Particular confirmada.'), findsOneWidget);
    });

    testWidgets('próxima particular: cancelar pede confirmação',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(lessons: [
        privateLesson(),
      ]);
      await pump(tester, repo: repo, location: AppRoutes.professorAvailability);

      await tap(tester, find.byKey(const Key('availability-cancel-pl1')));
      expect(find.text('Cancelar particular?'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.canceled, ['pl1']);
      expect(find.byKey(const Key('availability-upcoming-pl1')), findsNothing);
    });
  });

  group('aluno: agendar', () {
    final slots = ProfessorOpenSlots(
      durationMin: 60,
      autoConfirm: true,
      freeCancelHours: 12,
      slots: [
        OpenSlot(startAt: spInstant(21, 9), endAt: spInstant(21, 10)),
        OpenSlot(startAt: spInstant(21, 10), endAt: spInstant(21, 11)),
        OpenSlot(startAt: spInstant(22, 18), endAt: spInstant(22, 19)),
      ],
    );

    testWidgets('horários por dia, sem dupla, "Agendar" e o payload',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(slots: slots);
      final router =
          await pump(tester, repo: repo, location: bookPath('prof-x'));

      expect(find.text('Agendar particular'), findsOneWidget);
      expect(
          find.byKey(const Key('private-book-day-2026-10-21')), findsOneWidget);
      expect(inside('private-book-day-2026-10-21', find.text('Amanhã')),
          findsOneWidget);
      expect(inside('private-book-day-2026-10-22', find.text('Qui 22')),
          findsOneWidget);
      expect(find.text('09:00'), findsOneWidget);
      expect(find.text('10:00'), findsOneWidget);
      expect(find.text('18:00'), findsNothing);
      expect(find.byKey(const Key('private-book-pair')), findsNothing);
      expect(find.text('Cancelamento sem custo até 12h antes'), findsOneWidget);
      expect(
          inside('private-book-submit', find.text('Agendar')), findsOneWidget);

      await tap(tester, find.byKey(const Key('private-book-day-2026-10-22')));
      expect(find.text('09:00'), findsNothing);
      await tap(tester, find.byKey(Key(slotKey(spInstant(22, 18)))));
      await tester.enterText(
        inside('private-book-note', find.byType(TextField)),
        'Foco no smash',
      );
      await tap(tester, find.byKey(const Key('private-book-submit')));

      expect(repo.requests.single, {
        'professorUid': 'prof-x',
        'startAt': '2026-10-22T21:00:00.000Z',
        'pair': false,
        'note': 'Foco no smash',
      });
      expect(router.state.uri.path, AppRoutes.athletePrivateLessons);
    });

    testWidgets('dupla só quando aceita; "Pedir horário" sem agenda direto',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(
        slots: ProfessorOpenSlots(
          acceptPairs: true,
          autoConfirm: false,
          freeCancelHours: 0,
          slots: slots.slots,
        ),
      )..requestStatus = PrivateLessonStatus.pending;
      await pump(tester, repo: repo, location: bookPath('prof-x'));

      expect(inside('private-book-submit', find.text('Pedir horário')),
          findsOneWidget);
      expect(find.text('Cancelamento sem custo até o início da aula'),
          findsOneWidget);
      await tap(tester, inside('private-book-pair', find.byType(Switch)));
      await tap(tester, find.byKey(Key(slotKey(spInstant(21, 9)))));
      await tap(tester, find.byKey(const Key('private-book-submit')));
      expect(repo.requests.single['pair'], isTrue);
      expect(repo.requests.single.containsKey('note'), isFalse);
    });

    testWidgets('horário tomado: mostra a mensagem e recarrega',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(slots: slots)
        ..requestError = 'Este horário não está mais livre. Escolha outro.';
      final router =
          await pump(tester, repo: repo, location: bookPath('prof-x'));
      expect(repo.slotFetches, 1);

      await tap(tester, find.byKey(Key(slotKey(spInstant(21, 9)))));
      await tap(tester, find.byKey(const Key('private-book-submit')));
      expect(find.text('Este horário não está mais livre. Escolha outro.'),
          findsOneWidget);
      expect(repo.slotFetches, 2);
      expect(router.state.uri.path, bookPath('prof-x'));
    });

    testWidgets('sem horários: estado vazio', (tester) async {
      await pump(
        tester,
        repo: FakeProfessorAvailabilityRepository(),
        location: bookPath('prof-x'),
      );
      expect(find.text('Sem horários livres nos próximos 14 dias'),
          findsOneWidget);
      expect(find.byKey(const Key('private-book-submit')), findsNothing);
    });
  });

  group('aluno: minhas particulares', () {
    testWidgets('situações, agendar com o professor e cancelar',
        (tester) async {
      final repo = FakeProfessorAvailabilityRepository(
        availability: {
          'prof-1':
              ProfessorAvailability.fromMap(const {'freeCancelHours': 24}),
        },
        lessons: [
          privateLesson(),
          privateLesson(
              id: 'pend', status: 'pending', startAt: spInstant(24, 9)),
          privateLesson(
              id: 'decl', status: 'declined', startAt: spInstant(25, 9)),
          privateLesson(
              id: 'old',
              status: 'canceled',
              lateCancel: true,
              startAt: spInstant(15, 9)),
        ],
      );
      final router = await pump(
        tester,
        repo: repo,
        location: AppRoutes.athletePrivateLessons,
        professors: const [
          MyProfessor(professorUid: 'prof-1', name: 'Carlos Professor'),
        ],
      );

      expect(find.text('Minhas particulares'), findsOneWidget);
      expect(inside('athlete-private-pl1', find.text('CONFIRMADA')),
          findsOneWidget);
      expect(
          inside('athlete-private-pend', find.text('AGUARDANDO CONFIRMAÇÃO')),
          findsOneWidget);
      expect(inside('athlete-private-decl', find.text('RECUSADA')),
          findsOneWidget);
      expect(inside('athlete-private-old', find.text('CANCELADA')),
          findsOneWidget);
      expect(find.text('Cancelada fora do prazo sem custo.'), findsOneWidget);
      // Cancelar só nas ativas futuras.
      expect(
          find.byKey(const Key('athlete-private-cancel-pl1')), findsOneWidget);
      expect(
          find.byKey(const Key('athlete-private-cancel-pend')), findsOneWidget);
      expect(
          find.byKey(const Key('athlete-private-cancel-decl')), findsNothing);
      expect(find.byKey(const Key('athlete-private-cancel-old')), findsNothing);
      // 22h antes, prazo de 24h: aviso de cancelamento com custo.
      expect(
        inside('athlete-private-pl1',
            find.byKey(const Key('athlete-private-late-warning'))),
        findsOneWidget,
      );
      expect(
        inside('athlete-private-pend',
            find.byKey(const Key('athlete-private-late-warning'))),
        findsNothing,
      );

      await tap(tester, find.byKey(const Key('athlete-private-cancel-pl1')));
      expect(find.textContaining('o professor pode cobrar'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.canceled, ['pl1']);
      expect(inside('athlete-private-pl1', find.text('CANCELADA')),
          findsOneWidget);

      await tap(tester, find.byKey(const Key('private-book-prof-1')));
      expect(router.state.uri.path, bookPath('prof-1'));
      expect(find.text('CARLOS PROFESSOR'), findsOneWidget);
    });

    testWidgets('vazio', (tester) async {
      await pump(
        tester,
        repo: FakeProfessorAvailabilityRepository(),
        location: AppRoutes.athletePrivateLessons,
      );
      expect(find.byKey(const Key('athlete-private-empty')), findsOneWidget);
    });
  });

  group('push e guarda', () {
    test('professor_private_lesson usa o url de cada lado', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_private_lesson',
          'url': '/professor/mais/disponibilidade',
          'lessonId': 'x',
        }),
        AppRoutes.professorAvailability,
      );
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_private_lesson',
          'url': '/particulares',
        }),
        AppRoutes.athletePrivateLessons,
      );
      expect(
        resolveNotificationRoute(const {'type': 'professor_private_lesson'}),
        AppRoutes.athletePrivateLessons,
      );
    });

    test('rotas do aluno passam na guarda do modo Atleta', () {
      expect(isAthleteExperiencePath('/particulares'), isTrue);
      expect(isAthleteExperiencePath('/particulares/agendar/prof-1'), isTrue);
      expect(
          isProfessorExperiencePath(AppRoutes.professorAvailability), isTrue);
    });
  });
}
