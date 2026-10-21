import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/agenda/teacher_class_roster.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_shell_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts, professorLink;
import 'professor_actions_test_support.dart';
import 'professor_agenda_test_support.dart';
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

String text(WidgetTester tester, String key) =>
    tester.widget<Text>(find.byKey(Key(key))).data!;

/// Ter 20: manhã na CFC (concluída), agora na Norte, noite na CFC; Qui 22
/// conflito entre arenas; Sex 23 aula dentro do bloqueio.
FakeProfessorAgendaRepository agendaRepo() => FakeProfessorAgendaRepository(
      sessions: [
        agendaSession(id: 'manha', start: '07:00', end: '08:00'),
        agendaSession(
          id: 'agora',
          arenaId: 'arena-norte',
          arenaName: 'Arena Norte',
          className: 'Particular Pedro',
          classId: 'c2',
          start: '11:30',
          end: '12:30',
        ),
        agendaSession(id: 'noite', start: '19:00', end: '20:00'),
        agendaSession(
            id: 'q1', date: '2026-10-22', start: '07:00', end: '08:00'),
        agendaSession(
          id: 'q2',
          arenaId: 'arena-norte',
          arenaName: 'Arena Norte',
          date: '2026-10-22',
          start: '07:30',
          end: '08:30',
        ),
        agendaSession(
            id: 'sexta', date: '2026-10-23', start: '15:00', end: '16:00'),
        agendaSession(id: 'nov', date: '2026-11-03'),
      ],
      blocks: [agendaBlock()],
      rosters: {
        'noite': TeacherClassRoster.fromMap({
          'session': {'sessionId': 'noite'},
          'students': [
            {'studentId': 'st1', 'name': 'João Silva', 'kind': 'regular'},
            {'studentId': 'st2', 'name': 'Maria Souza', 'kind': 'makeup'},
          ],
        }),
      },
    );

void main() {
  setUpAll(loadProfessorLinksFonts);

  test('barra: Hoje · Agenda · Alunos · Mensagens · Mais', () {
    expect(ProfessorTabBar.items.map((i) => i.label),
        ['Hoje', 'Agenda', 'Alunos', 'Mensagens', 'Mais']);
  });

  group('E1 Dia', () {
    testWidgets('lista do dia com AGORA, concluída e deslocamento',
        (tester) async {
      final repo = agendaRepo();
      await pumpProfessorAgendaApp(
        tester,
        agenda: repo,
        location: AppRoutes.professorAgenda,
      );
      // Carregou só a semana (Dia).
      expect(repo.ranges.last, (fromKey: '2026-10-19', toKey: '2026-10-25'));
      expect(text(tester, 'professor-agenda-subtitle'),
          'TER, 20 OUT · 3 AULAS · 2 ARENAS');
      expect(find.byKey(const Key('professor-agenda-item-session:manha')),
          findsOneWidget);
      expect(
        inside('professor-agenda-item-session:agora', find.text('AGORA')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('professor-agenda-travel-Arena Norte')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-agenda-legend-arena-cfc')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-agenda-legend-arena-norte')),
          findsOneWidget);
      // Tira da semana: contagem por dia.
      expect(
        inside('professor-agenda-day-2026-10-22', find.text('2')),
        findsOneWidget,
      );
    });

    testWidgets('conflito: aviso abre a folha com os dois itens',
        (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        location: AppRoutes.professorAgenda,
      );
      await tap(tester, find.byKey(const Key('professor-agenda-conflicts')));
      expect(find.text('Conflito de horário'), findsOneWidget);
      expect(find.byKey(const Key('professor-conflict-session:q1')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-conflict-session:q2')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-conflict-block:b1:2026-10-23')),
          findsOneWidget);
      // Atalho abre o item.
      await tap(tester, find.byKey(const Key('professor-conflict-session:q2')));
      expect(find.text('Iniciante A'), findsOneWidget);
      expect(find.text('Quadra 2'), findsOneWidget);
    });

    testWidgets('trocar o dia pela tira', (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        location: AppRoutes.professorAgenda,
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-day-2026-10-24')));
      expect(
          find.byKey(const Key('professor-agenda-day-empty')), findsOneWidget);
    });
  });

  group('E2 Semana e E3 Mês', () {
    testWidgets('Semana: blocos, bloqueio, linha do agora; toque no dia',
        (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        location: AppRoutes.professorAgenda,
      );
      await tap(tester, find.text('Semana'));
      expect(
          text(tester, 'professor-agenda-subtitle'), '19 OUT–25 OUT · 6 AULAS');
      expect(find.byKey(const Key('professor-agenda-block-session:noite')),
          findsOneWidget);
      expect(
          find.byKey(const Key('professor-agenda-block-block:b1:2026-10-23')),
          findsOneWidget);
      expect(
          find.byKey(const Key('professor-agenda-now-line')), findsOneWidget);
      await tap(tester,
          find.byKey(const Key('professor-agenda-week-head-2026-10-23')));
      expect(
          text(tester, 'professor-agenda-subtitle'), startsWith('SEX, 23 OUT'));
    });

    testWidgets('Mês: carrega o mês, resumo e dias bloqueados', (tester) async {
      final repo = agendaRepo();
      await pumpProfessorAgendaApp(
        tester,
        agenda: repo,
        location: AppRoutes.professorAgenda,
      );
      await tap(tester, find.text('Mês'));
      expect(repo.ranges.last, (fromKey: '2026-10-01', toKey: '2026-10-31'));
      expect(text(tester, 'professor-agenda-month-lessons'), '6');
      expect(text(tester, 'professor-agenda-month-hours'), '6h');
      expect(text(tester, 'professor-agenda-month-blocked'), '1');
      expect(find.byKey(const Key('professor-agenda-month-2026-10-23')),
          findsOneWidget);
      // Próximo mês.
      await tap(tester, find.byKey(const Key('professor-agenda-next')));
      expect(repo.ranges.last, (fromKey: '2026-11-01', toKey: '2026-11-30'));
      expect(text(tester, 'professor-agenda-month-lessons'), '1');
    });

    testWidgets('erro da callable: cartão para tentar de novo', (tester) async {
      final repo = agendaRepo()..sessionsError = Exception('x');
      await pumpProfessorAgendaApp(
        tester,
        agenda: repo,
        location: AppRoutes.professorAgenda,
      );
      expect(find.textContaining('Não foi possível carregar sua agenda'),
          findsOneWidget);
    });
  });

  group('E4 Turma', () {
    testWidgets('alunos pela chamada, Abrir chamada e Cancelar com a chave',
        (tester) async {
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        location: AppRoutes.professorAgenda,
        actions: actions,
        snapshot: professorStudentsSnapshot(arenas: [
          {
            ...arenaMap(),
            'actions': {'canCancelLessons': true},
          },
        ]),
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-item-session:noite')));
      expect(find.text('João Silva'), findsOneWidget);
      expect(find.text('REPOSIÇÃO'), findsOneWidget);
      expect(
        inside('professor-agenda-session-recurrence',
            find.textContaining('19:00')),
        findsOneWidget,
      );

      await tap(
          tester, find.byKey(const Key('professor-agenda-session-cancel')));
      expect(find.text('Cancelar aula?'), findsOneWidget);
      expect(find.text('MOTIVO · OS ALUNOS VEEM'), findsOneWidget);
      // Sem motivo não cancela.
      expect(
        tester
            .widget<FilledButton>(
                find.byKey(const Key('professor-cancel-confirm')))
            .onPressed,
        isNull,
      );
      expect(find.text('+1 crédito'), findsOneWidget);
      expect(find.text('Liberada'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-cancel-reason-health')));
      await tap(tester, find.byKey(const Key('professor-cancel-toggle')));
      expect(find.text('Sem crédito'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-cancel-confirm')));
      expect(actions.cancels.single.sessionId, 'noite');
      expect(actions.cancels.single.credits, isFalse);
      expect(actions.cancels.single.reason, 'health');
      // E5d com os números do servidor.
      expect(find.text('Aula cancelada'), findsOneWidget);
      expect(find.text('6/6'), findsOneWidget);
      expect(find.text('Valem 30 dias'), findsOneWidget);
      expect(find.text('Gestão da arena avisada'), findsOneWidget);
      expect(find.textContaining('Desfazer'), findsNothing);
      await tap(tester, find.byKey(const Key('professor-cancel-done-back')));
      expect(find.text('Aula cancelada'), findsNothing);
    });

    testWidgets('sem a chave e sem a chamada: só a informação', (tester) async {
      final repo = FakeProfessorAgendaRepository(sessions: [
        agendaSession(id: 'noite', start: '19:00', canManage: false),
      ]);
      await pumpProfessorAgendaApp(
        tester,
        agenda: repo,
        location: AppRoutes.professorAgenda,
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-item-session:noite')));
      expect(find.byKey(const Key('professor-agenda-session-no-roster')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-agenda-session-cancel')),
          findsNothing);
      expect(find.byKey(const Key('professor-agenda-session-attendance')),
          findsNothing);
    });

    testWidgets('Abrir chamada vai para a chamada da aula', (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        location: AppRoutes.professorAgenda,
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-item-session:noite')));
      await tap(
          tester, find.byKey(const Key('professor-agenda-session-attendance')));
      expect(find.text('chamada noite'), findsOneWidget);
    });

    testWidgets('aula que já terminou: "Story" no lugar de "Cancelar"',
        (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        location: AppRoutes.professorAgenda,
        snapshot: professorStudentsSnapshot(arenas: [
          {
            ...arenaMap(),
            'actions': {'canCancelLessons': true},
          },
        ]),
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-item-session:manha')));
      expect(find.byKey(const Key('professor-agenda-session-cancel')),
          findsNothing);
      await tap(tester, find.byKey(const Key('professor-agenda-session-story')));
      expect(find.text('encerrado manha'), findsOneWidget);
    });

    testWidgets('aula de mais tarde: sem "Story"', (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        location: AppRoutes.professorAgenda,
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-item-session:noite')));
      expect(find.byKey(const Key('professor-agenda-session-story')),
          findsNothing);
    });
  });

  group('E5 Particular da carteira', () {
    FakeProfessorWalletRepository wallet() => FakeProfessorWalletRepository(
          plans: walletPlans(),
          students: [walletStudent()],
          lessons: [
            walletLesson(
                bookingId: 'bk-amanha', date: '2026-10-21', startTime: '19:00'),
            walletLesson(
                bookingId: 'bk-logo', date: '2026-10-20', startTime: '15:00'),
          ],
          bookings: [
            walletBooking(id: 'bk-amanha', date: '2026-10-21'),
            walletBooking(id: 'bk-logo', date: '2026-10-20'),
          ],
        );

    testWidgets('reserva, cobrança e cancelar dentro do prazo', (tester) async {
      final bookings = FakeBookingService();
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorAgendaApp(
        tester,
        agenda: FakeProfessorAgendaRepository(),
        wallet: wallet(),
        bookings: bookings,
        actions: actions,
        location: AppRoutes.professorAgendaLesson
            .replaceAll(':bookingId', 'bk-amanha'),
      );
      expect(find.text('Paulo Viana'), findsOneWidget);
      expect(
        inside('professor-agenda-lesson-booking',
            find.textContaining('confirmada')),
        findsOneWidget,
      );
      expect(
          inside('professor-agenda-lesson-plan', find.text('Mensal 8 aulas')),
          findsOneWidget);
      expect(
        inside('professor-agenda-lesson-deadline',
            find.textContaining('13:00 de qua')),
        findsOneWidget,
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-lesson-cancel')));
      expect(find.text('Cancelar aula?'), findsOneWidget);
      expect(find.text('Sem multa'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-cancel-reason-rain')));
      await tap(tester, find.byKey(const Key('professor-cancel-confirm')));
      expect(bookings.canceled.single,
          (bookingId: 'bk-amanha', athleteId: professorStudentsTestUid));
      expect(actions.lessonCancelNotices.single,
          (bookingId: 'bk-amanha', reason: 'rain'));
      expect(find.text('Aula cancelada'), findsOneWidget);
      expect(find.text('Avisado'), findsOneWidget);
    });

    testWidgets('fora do prazo: avisa a retenção e cancela só no "mesmo"',
        (tester) async {
      final bookings = FakeBookingService();
      final actions = FakeProfessorActionsRepository();
      await pumpProfessorAgendaApp(
        tester,
        agenda: FakeProfessorAgendaRepository(),
        wallet: wallet(),
        bookings: bookings,
        actions: actions,
        location:
            AppRoutes.professorAgendaLesson.replaceAll(':bookingId', 'bk-logo'),
      );
      expect(
        inside(
            'professor-agenda-lesson-deadline', find.text('prazo encerrado')),
        findsOneWidget,
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-lesson-cancel')));
      expect(find.text('Fora do prazo'), findsOneWidget);
      expect(find.textContaining('começa em 3h'), findsOneWidget);
      expect(find.textContaining('a arena retém 50% do valor pago'),
          findsOneWidget);
      expect(find.text('Retém 50%'), findsOneWidget);
      // Sem chips: o motivo vai como "outro".
      expect(find.byKey(const Key('professor-cancel-reason-rain')),
          findsNothing);
      expect(find.text('Falar com Paulo'), findsOneWidget);
      expect(bookings.canceled, isEmpty);
      await tap(tester, find.byKey(const Key('professor-cancel-confirm')));
      expect(bookings.canceled.single.bookingId, 'bk-logo');
      expect(actions.lessonCancelNotices.single.reason, 'other');
      expect(find.text('Fora do prazo · a arena retém 50%'), findsOneWidget);
    });

    testWidgets('aula da carteira aparece no Dia e abre o detalhe',
        (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: FakeProfessorAgendaRepository(),
        wallet: wallet(),
        location: AppRoutes.professorAgenda,
      );
      await tap(tester,
          find.byKey(const Key('professor-agenda-item-lesson:bk-logo')));
      expect(find.byKey(const Key('professor-agenda-lesson-booking')),
          findsOneWidget);
    });
  });

  group('E7 Bloquear período', () {
    testWidgets('"+" → bloquear: motivo e período gravados', (tester) async {
      final repo = agendaRepo();
      await pumpProfessorAgendaApp(
        tester,
        agenda: repo,
        location: AppRoutes.professorAgenda,
      );
      await tap(
          tester, find.byKey(const Key('professor-agenda-day-2026-10-23')));
      await tap(tester, find.byKey(const Key('professor-agenda-add')));
      expect(
          find.byKey(const Key('professor-agenda-add-lesson')), findsNothing);
      await tap(tester, find.byKey(const Key('professor-agenda-add-block')));
      expect(find.text('Bloquear período'), findsWidgets);
      // Padrão: o dia escolhido, 8h–18h → pega a aula das 15h.
      expect(find.byKey(const Key('professor-block-affected-session:sexta')),
          findsOneWidget);
      expect(find.byKey(const Key('professor-block-warning')), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-block-reason-viagem')));
      await tap(tester, find.byKey(const Key('professor-block-save')));
      final saved = repo.saved.single;
      expect(saved.blockId, isNull);
      expect(saved.doc['reason'], 'viagem');
      expect(saved.input.startAt, DateTime.utc(2026, 10, 23, 11));
      expect(saved.input.endAt, DateTime.utc(2026, 10, 23, 21));
    });

    testWidgets('editar e apagar o bloqueio', (tester) async {
      final repo = agendaRepo();
      await pumpProfessorAgendaApp(
        tester,
        agenda: repo,
        location: AppRoutes.professorBlockEdit.replaceAll(':blockId', 'b1'),
      );
      expect(find.text('Sex 23 out · 14:00'), findsOneWidget);
      expect(find.byKey(const Key('professor-block-affected-session:sexta')),
          findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-block-delete')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.deleted, ['b1']);
    });

    testWidgets('"+" do independente oferece Nova aula para aluno',
        (tester) async {
      await pumpProfessorAgendaApp(
        tester,
        agenda: agendaRepo(),
        wallet: FakeProfessorWalletRepository(students: [walletStudent()]),
        links: [
          professorLink(
            arenaId: 'arena-norte',
            arenaName: 'Arena Norte',
            type: ArenaProfessorLinkType.independent,
          ),
        ],
        location: AppRoutes.professorAgenda,
      );
      await tap(tester, find.byKey(const Key('professor-agenda-add')));
      await tap(tester, find.byKey(const Key('professor-agenda-add-lesson')));
      await tap(
          tester, find.byKey(const Key('professor-agenda-pick-ath-paulo')));
      expect(find.text('arena arena-norte'), findsOneWidget);
    });
  });

  group('E8 Sincronizar', () {
    testWidgets('liga o feed, copia, abre o Google e ajusta', (tester) async {
      final repo = agendaRepo();
      await pumpProfessorAgendaApp(
        tester,
        agenda: repo,
        location: AppRoutes.professorCalendarSync,
      );
      expect(repo.feedCalls.single.rotate, isFalse);
      expect(text(tester, 'professor-sync-url'), contains('t=tok1'));

      await tap(tester, find.byKey(const Key('professor-sync-open-google')));
      expect(openedCalendarUris.single.toString(),
          startsWith('https://calendar.google.com/calendar/r?cid=https%3A'));
      await tap(tester, find.byKey(const Key('professor-sync-open-apple')));
      expect(openedCalendarUris.last.scheme, 'webcal');

      await tap(tester, inside('professor-sync-names', find.byType(Switch)));
      expect(repo.feedCalls.last.names, isTrue);

      await tap(tester,
          inside('professor-sync-arena-arena-norte', find.byType(Switch)));
      expect(repo.feedCalls.last.excluded, ['arena-norte']);

      await tap(tester, find.byKey(const Key('professor-sync-rotate')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.feedCalls.last.rotate, isTrue);
      expect(text(tester, 'professor-sync-url'), isNot(contains('t=tok1')));
    });
  });
}
