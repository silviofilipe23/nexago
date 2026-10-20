import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/auth/role_route_guard.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_agenda_entry.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_agenda.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_notices.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import 'professor_agenda_test_support.dart' show agendaSession;
import 'professor_notices_test_support.dart';
import 'professor_students_test_support.dart';
import 'professor_wallet_test_support.dart';

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder field(String key) => find.descendant(
      of: find.byKey(Key(key)),
      matching: find.byType(TextField),
    );

Future<void> type(WidgetTester tester, Finder f, String text) async {
  await tester.ensureVisible(f);
  await tester.enterText(f, text);
  await settleProfessorStudents(tester, 2);
}

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('A · classType da agenda', () {
    test('lê o campo e prefere ele ao mapa das turmas', () {
      final e = ClassAgendaEntry.fromMap(const {
        'sessionId': 's',
        'classId': 'c1',
        'classType': 'dupla',
        'role': 'teacher',
      });
      expect(e.classType, 'dupla');
      expect(
        professorSessionType(e, const {'c1': ArenaClassType.particular}),
        ArenaClassType.dupla,
      );
      final old = ClassAgendaEntry.fromMap(const {'classId': 'c1'});
      expect(old.classType, isNull);
      expect(
        professorSessionType(old, const {'c1': ArenaClassType.particular}),
        ArenaClassType.particular,
      );
      final items = buildProfessorAgendaItems(
        sessions: [agendaSession(id: 'x', classId: 'c9')],
        lessons: const [],
        bookingStatus: const {},
        blocks: const [],
      );
      expect(items.single.typeLabel, 'Turma');
    });
  });

  group('lógica dos comunicados', () {
    test('lê o doc: respostas por índice e datas', () {
      final n = ProfessorNotice.fromMap('n1', {
        'kind': 'enquete',
        'title': 'Aulão',
        'body': 'Sábado',
        'status': 'sent',
        'pollOptions': ['Vou', 'Não vou'],
        'audience': {
          'classIds': ['c1'],
          'wallet': true
        },
        'answers': {'0': 5, '1': 2, 'x': 9},
        'recipientIds': ['a', 'b'],
        'recipientCount': 2,
        'readCount': 1,
        'sentAt': Timestamp.fromDate(DateTime.utc(2026, 10, 19, 23)),
      });
      expect(n.isPoll, isTrue);
      expect(n.answersFor(0), 5);
      expect(n.answersFor(1), 2);
      expect(n.answersFor(2), 0);
      expect(n.audience.wallet, isTrue);
      expect(n.when, DateTime.utc(2026, 10, 19, 23));
      final r = ProfessorNoticeRecipient.fromMap('a', {
        'readAt': Timestamp.fromDate(DateTime.utc(2026, 10, 20)),
        'answer': 'Vou',
      });
      expect(r.read, isTrue);
      expect(r.answer, 'Vou');
    });

    test('payload: opções limpas só na enquete, datas em ISO', () {
      final poll = ProfessorNoticeInput(
        noticeId: 'n1',
        kind: ProfessorNoticeKind.enquete,
        title: ' Aulão ',
        body: ' Vem? ',
        pollOptions: const ['Vou', ' ', 'Vou', 'Não vou'],
        audience: const ProfessorNoticeAudience(classIds: ['c1']),
        scheduledAt: DateTime.utc(2026, 10, 21, 11),
        remindAt: DateTime.utc(2026, 10, 23, 21),
      ).toPayload();
      expect(poll, {
        'noticeId': 'n1',
        'kind': 'enquete',
        'title': 'Aulão',
        'body': 'Vem?',
        'pollOptions': ['Vou', 'Não vou'],
        'audience': {
          'classIds': ['c1'],
          'wallet': false
        },
        'scheduledAt': '2026-10-21T11:00:00.000Z',
        'remindAt': '2026-10-23T21:00:00.000Z',
      });
      final aviso = const ProfessorNoticeInput(
        kind: ProfessorNoticeKind.aviso,
        title: 'T',
        body: 'B',
        pollOptions: ['x'],
        audience: ProfessorNoticeAudience(wallet: true),
      ).toPayload();
      expect(aviso['pollOptions'], isEmpty);
      expect(aviso.containsKey('scheduledAt'), isFalse);
    });

    test('validação com as mensagens do servidor', () {
      ProfessorNoticeInput i({
        String title = 'T',
        String body = 'B',
        ProfessorNoticeKind kind = ProfessorNoticeKind.aviso,
        List<String> options = const [],
        ProfessorNoticeAudience audience =
            const ProfessorNoticeAudience(wallet: true),
        DateTime? at,
        DateTime? remind,
      }) =>
          ProfessorNoticeInput(
            kind: kind,
            title: title,
            body: body,
            pollOptions: options,
            audience: audience,
            scheduledAt: at,
            remindAt: remind,
          );
      final now = DateTime.utc(2026, 10, 20, 15);
      expect(validateProfessorNoticeContent(i(title: ' ')),
          'Dê um título (até 80 caracteres).');
      expect(validateProfessorNoticeContent(i(body: '')),
          'Escreva a mensagem (até 2000 caracteres).');
      expect(
        validateProfessorNoticeContent(i(
            kind: ProfessorNoticeKind.enquete, options: const ['Vou', 'Vou'])),
        'A enquete precisa de pelo menos 2 opções.',
      );
      expect(
        validateProfessorNoticeSend(
            i(audience: const ProfessorNoticeAudience()), now),
        'Escolha para quem enviar.',
      );
      expect(
        validateProfessorNoticeSend(
            i(at: now.subtract(const Duration(hours: 1))), now),
        'O agendamento não pode estar no passado.',
      );
      expect(
        validateProfessorNoticeSend(
            i(at: now.add(const Duration(days: 61))), now),
        'Agende para no máximo 60 dias.',
      );
      expect(validateProfessorNoticeSend(i(remind: now), now),
          'O lembrete tem de ser depois do envio.');
      expect(
        validateProfessorNoticeSend(
            i(remind: now.add(const Duration(days: 1))), now),
        isNull,
      );
    });

    test('abas: enviados do mais novo, agendados do mais próximo', () {
      final all = [
        notice(id: 'a', sentAt: DateTime.utc(2026, 10, 1)),
        notice(id: 'b', sentAt: DateTime.utc(2026, 10, 10)),
        notice(
            id: 'c',
            status: ProfessorNoticeStatus.scheduled,
            scheduledAt: DateTime.utc(2026, 10, 25)),
        notice(
            id: 'd',
            status: ProfessorNoticeStatus.scheduled,
            scheduledAt: DateTime.utc(2026, 10, 21)),
        notice(id: 'e', status: ProfessorNoticeStatus.draft),
      ];
      expect(
          professorNoticesOf(all, ProfessorNoticeStatus.sent).map((n) => n.id),
          ['b', 'a']);
      expect(
          professorNoticesOf(all, ProfessorNoticeStatus.scheduled)
              .map((n) => n.id),
          ['d', 'c']);
      expect(
          professorNoticesOf(all, ProfessorNoticeStatus.draft).single.id, 'e');
    });

    test('rótulo do público', () {
      final classes = <ProfessorNoticeClass>[
        (
          classId: 'c1',
          name: 'Iniciante A',
          arenaId: 'a',
          arenaName: 'A',
          students: 4
        ),
        (
          classId: 'c2',
          name: 'Avançado',
          arenaId: 'a',
          arenaName: 'A',
          students: 3
        ),
        (
          classId: 'c3',
          name: 'Kids',
          arenaId: 'b',
          arenaName: 'B',
          students: 3
        ),
      ];
      String label(ProfessorNoticeAudience a, {bool wallet = true}) =>
          professorNoticeAudienceLabel(a, classes, hasWallet: wallet);
      expect(
        label(const ProfessorNoticeAudience(
            classIds: ['c1', 'c2', 'c3'], wallet: true)),
        'Todos os alunos',
      );
      expect(label(const ProfessorNoticeAudience(classIds: ['c1', 'c2'])),
          'Iniciante A, Avançado');
      expect(
        label(const ProfessorNoticeAudience(
            classIds: ['c1', 'c2', 'c3'], wallet: false)),
        '3 turmas',
      );
      expect(label(const ProfessorNoticeAudience(wallet: true)), 'Carteira');
      expect(
          label(const ProfessorNoticeAudience(classIds: ['c1'], wallet: true)),
          'Iniciante A, Carteira');
    });

    test('relatório: linhas, pendentes e filtros', () {
      final n = notice();
      final rows = professorNoticeRows(n, [
        ProfessorNoticeRecipient(
            athleteId: 'ath-1', readAt: DateTime.utc(2026), answer: 'Vou'),
        ProfessorNoticeRecipient(
            athleteId: 'ath-paulo', readAt: DateTime.utc(2026)),
      ]);
      expect(rows.map((r) => r.reply), [
        ProfessorNoticeReply.answered,
        ProfessorNoticeReply.readOnly,
        ProfessorNoticeReply.unread,
        ProfessorNoticeReply.unread,
      ]);
      // Enquete: lembra quem não respondeu; aviso: quem não leu.
      expect(professorNoticePending(n, rows), 3);
      final aviso = notice(kind: ProfessorNoticeKind.aviso);
      expect(
        professorNoticePending(
            aviso,
            professorNoticeRows(aviso, [
              ProfessorNoticeRecipient(
                  athleteId: 'ath-1', readAt: DateTime.utc(2026)),
            ])),
        3,
      );
      expect(
        professorNoticeFilter(rows, const ProfessorNoticeFilterOption('Vou'))
            .single
            .athleteId,
        'ath-1',
      );
      expect(
        professorNoticeFilter(rows,
                const ProfessorNoticeFilterReply(ProfessorNoticeReply.unread))
            .length,
        2,
      );
    });

    test('push e guarda do aluno', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_notice',
          'url': '/aviso-professor/n1',
        }),
        '/aviso-professor/n1',
      );
      expect(
        resolveNotificationRoute(
            const {'type': 'professor_notice', 'noticeId': 'n2'}),
        AppRoutes.professorNoticeForStudent.replaceAll(':noticeId', 'n2'),
      );
      expect(isAthleteExperiencePath('/aviso-professor/n1'), isTrue);
    });
  });

  group('F1 lista', () {
    testWidgets('abas, leitura e a primeira opção da enquete', (tester) async {
      final repo = FakeProfessorNoticesRepository(notices: [
        notice(),
        notice(
            id: 'ag',
            title: 'Nova turma de manhã',
            kind: ProfessorNoticeKind.aviso,
            status: ProfessorNoticeStatus.scheduled,
            scheduledAt: DateTime.utc(2026, 10, 21, 11)),
        notice(
            id: 'rs',
            title: 'Reajuste',
            kind: ProfessorNoticeKind.financeiro,
            status: ProfessorNoticeStatus.draft),
      ]);
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        location: AppRoutes.professorNotices,
      );
      expect(find.text('Agendados · 1'), findsOneWidget);
      expect(find.text('Rascunhos · 1'), findsOneWidget);
      expect(find.text('3/4 leram'), findsOneWidget);
      expect(find.text('Vou · 2'), findsOneWidget);
      expect(find.text('ENQUETE'), findsOneWidget);

      await tap(
          tester, find.byKey(const Key('professor-notices-tab-scheduled')));
      expect(find.text('Nova turma de manhã'), findsOneWidget);
      expect(find.textContaining('AGENDADO · '), findsOneWidget);

      await tap(tester, find.byKey(const Key('professor-notices-tab-draft')));
      await tap(tester, find.byKey(const Key('professor-notice-rs')));
      expect(find.text('Editar comunicado'), findsOneWidget);
      expect(find.text('Reajuste'), findsOneWidget);
    });

    testWidgets('enviado abre o relatório', (tester) async {
      await pumpProfessorNoticesApp(
        tester,
        notices: FakeProfessorNoticesRepository(notices: [notice()]),
        location: AppRoutes.professorNotices,
      );
      await tap(tester, find.byKey(const Key('professor-notice-n1')));
      expect(find.byKey(const Key('professor-notice-report-read')),
          findsOneWidget);
    });
  });

  group('F2–F4 editor', () {
    testWidgets('conteúdo valida, prévia e rascunho', (tester) async {
      final repo = FakeProfessorNoticesRepository();
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        location: AppRoutes.professorNoticeNew,
      );
      await tap(tester, find.byKey(const Key('professor-notice-next')));
      expect(find.text('Dê um título (até 80 caracteres).'), findsOneWidget);

      await tap(tester, find.byKey(const Key('professor-notice-kind-enquete')));
      await type(tester, field('professor-notice-title'), 'Aulão de sábado');
      await type(tester, find.byKey(const Key('professor-notice-body')),
          'Sábado às 10h.');
      await tap(tester, find.byKey(const Key('professor-notice-option-add')));
      await type(tester, field('professor-notice-option-field-2'), 'Talvez');

      await tap(
          tester, find.byKey(const Key('professor-notice-preview-button')));
      expect(find.text('PRÉVIA · COMO O ALUNO VÊ'), findsOneWidget);
      expect(find.byKey(const Key('professor-notice-option-Talvez')),
          findsOneWidget);
      await tester.tapAt(const Offset(10, 10));
      await settleProfessorStudents(tester);

      await tap(tester, find.byKey(const Key('professor-notice-save-draft')));
      expect(repo.saved.single['kind'], 'enquete');
      expect(repo.saved.single['pollOptions'], ['Vou', 'Não vou', 'Talvez']);
      expect(repo.saved.single['title'], 'Aulão de sábado');
    });

    testWidgets('destinatários com contagem e envio agora', (tester) async {
      final repo = FakeProfessorNoticesRepository(previewCount: 5);
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        wallet: FakeProfessorWalletRepository(students: [walletStudent()]),
        location: AppRoutes.professorNoticeNew,
      );
      await type(tester, field('professor-notice-title'), 'Sem aula hoje');
      await type(tester, find.byKey(const Key('professor-notice-body')),
          'Chuva forte.');
      await tap(tester, find.byKey(const Key('professor-notice-next')));
      expect(find.text('Arena CFC'.toUpperCase()), findsOneWidget);
      expect(find.byKey(const Key('professor-notice-wallet')), findsOneWidget);

      await tap(tester, find.byKey(const Key('professor-notice-class-c1')));
      expect(repo.previews.last, {
        'classIds': ['c1'],
        'wallet': false
      });
      expect(find.text('Continuar · 5 alunos'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-notice-wallet')));
      expect(repo.previews.last['wallet'], isTrue);

      await tap(tester, find.byKey(const Key('professor-notice-continue')));
      await tap(tester, find.byKey(const Key('professor-notice-send')));
      expect(repo.sent.single, {
        'kind': 'aviso',
        'title': 'Sem aula hoje',
        'body': 'Chuva forte.',
        'pollOptions': <String>[],
        'audience': {
          'classIds': ['c1'],
          'wallet': true
        },
      });
      expect(find.text('Enviado para 5 alunos.'), findsOneWidget);
    });

    testWidgets('agendar com lembrete', (tester) async {
      final repo = FakeProfessorNoticesRepository();
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        location: AppRoutes.professorNoticeNew,
      );
      await type(tester, field('professor-notice-title'), 'Aviso');
      await type(
          tester, find.byKey(const Key('professor-notice-body')), 'Texto');
      await tap(tester, find.byKey(const Key('professor-notice-next')));
      await tap(tester, find.byKey(const Key('professor-notice-audience-all')));
      await tap(tester, find.byKey(const Key('professor-notice-continue')));
      await tap(
          tester, find.byKey(const Key('professor-notice-when-schedule')));
      await tap(tester, inside('professor-notice-remind', find.byType(Switch)));
      await tap(tester, find.byKey(const Key('professor-notice-send')));
      final payload = repo.sent.single;
      // Amanhã 08:00 em SP; lembrete 2 dias depois às 18:00.
      expect(payload['scheduledAt'], '2026-10-21T11:00:00.000Z');
      expect(payload['remindAt'], '2026-10-23T21:00:00.000Z');
      expect(payload['audience'], {
        'classIds': ['c1', 'c2'],
        'wallet': false
      });
      expect(find.text('Comunicado agendado.'), findsOneWidget);
    });

    testWidgets('editar rascunho carrega os campos e apaga', (tester) async {
      final repo = FakeProfessorNoticesRepository(notices: [
        notice(
            id: 'rs', title: 'Reajuste', status: ProfessorNoticeStatus.draft),
      ]);
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        location: AppRoutes.professorNoticeEdit.replaceAll(':noticeId', 'rs'),
      );
      expect(find.text('Reajuste'), findsOneWidget);
      expect(find.text('Talvez'), findsOneWidget);
      await tap(tester, find.byKey(const Key('professor-notice-save-draft')));
      expect(repo.saved.single['noticeId'], 'rs');

      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        location: AppRoutes.professorNoticeEdit.replaceAll(':noticeId', 'rs'),
      );
      await tap(tester, find.byKey(const Key('professor-notice-delete')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.deleted, ['rs']);
    });
  });

  group('F5 relatório', () {
    testWidgets('totais, nomes, filtros e lembrar', (tester) async {
      final repo = FakeProfessorNoticesRepository(
        notices: [notice()],
        recipients: {
          'n1': [
            ProfessorNoticeRecipient(
                athleteId: 'ath-1', readAt: DateTime.utc(2026), answer: 'Vou'),
            ProfessorNoticeRecipient(
                athleteId: 'ath-paulo', readAt: DateTime.utc(2026)),
          ],
        },
      );
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        wallet: FakeProfessorWalletRepository(students: [walletStudent()]),
        location: AppRoutes.professorNoticeReport.replaceAll(':noticeId', 'n1'),
      );
      expect(
        tester
            .widget<Text>(find.byKey(const Key('professor-notice-report-read')))
            .data,
        '3/4',
      );
      expect(
        inside('professor-notice-row-ath-1', find.text('João Silva')),
        findsOneWidget,
      );
      expect(inside('professor-notice-row-ath-1', find.text('Vou')),
          findsOneWidget);
      expect(
        inside(
            'professor-notice-row-ath-paulo', find.text('Leu · sem resposta')),
        findsOneWidget,
      );
      expect(inside('professor-notice-row-ath-x', find.text('Aluno')),
          findsOneWidget);

      await tap(tester,
          find.byKey(const Key('professor-notice-filter-Não leram · 2')));
      expect(find.byKey(const Key('professor-notice-row-ath-1')), findsNothing);
      expect(
          find.byKey(const Key('professor-notice-row-ath-x')), findsOneWidget);

      expect(find.text('Lembrar 3 que não responderam'), findsOneWidget);
      await tap(
          tester, find.byKey(const Key('professor-notice-remind-button')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.reminded, ['n1']);
      expect(find.text('Lembrete enviado para 2 alunos.'), findsOneWidget);
    });
  });

  group('F7 aluno', () {
    testWidgets('abrir marca lido; tocar responde (e troca)', (tester) async {
      final repo = FakeProfessorNoticesRepository(notices: [notice()]);
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        location:
            AppRoutes.professorNoticeForStudent.replaceAll(':noticeId', 'n1'),
      );
      expect(repo.responses.first, (noticeId: 'n1', answer: null));
      expect(find.text('DO PROF. CARLOS PROFESSOR'), findsOneWidget);
      await tap(
          tester, find.byKey(const Key('professor-notice-option-Talvez')));
      expect(repo.responses.last, (noticeId: 'n1', answer: 'Talvez'));
      await tap(tester, find.byKey(const Key('professor-notice-option-Vou')));
      expect(repo.responses.last, (noticeId: 'n1', answer: 'Vou'));
      // Marcar lido só uma vez.
      expect(repo.responses.where((r) => r.answer == null).length, 1);
    });

    testWidgets('não é para esta conta: aviso amigável', (tester) async {
      final repo = FakeProfessorNoticesRepository();
      await pumpProfessorNoticesApp(
        tester,
        notices: repo,
        location:
            AppRoutes.professorNoticeForStudent.replaceAll(':noticeId', 'zz'),
      );
      expect(find.byKey(const Key('professor-notice-student-missing')),
          findsOneWidget);
      expect(repo.responses, isEmpty);
    });
  });
}
