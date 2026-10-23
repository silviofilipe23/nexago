import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart'
    show TrainingCenterLink;
import 'package:nexago_app/core/auth/role_route_guard.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';
import 'package:nexago_app/features/professor_mode/presentation/professor_shell_page.dart';

import '../professor_links/professor_links_test_support.dart'
    show loadProfessorLinksFonts;
import '../professor_mode/professor_students_test_support.dart';
import '../professor_mode/professor_wallet_test_support.dart';
import 'messages_test_support.dart';

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

String convPath(String id) =>
    AppRoutes.professorConversation.replaceAll(':conversationId', id);

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('lógica', () {
    test('lê a conversa: não lidas, encerrada, título do outro lado', () {
      final c = Conversation.fromMap('d_p_a', {
        'kind': 'direct',
        'professorUid': 'p',
        'athleteUid': 'a',
        'memberIds': ['p', 'a'],
        'memberNames': {'p': 'Carlos', 'a': 'Paulo Viana'},
        'memberPhotos': {'p': null, 'a': 'https://x/a.png'},
        'lastMessage': {'text': 'Oi', 'senderUid': 'a', 'senderName': 'Paulo'},
        'lastAt': Timestamp.fromDate(DateTime.utc(2026, 10, 20, 14)),
        'unread': {'p': 2},
        'closed': true,
      });
      expect(c.isGroup, isFalse);
      expect(c.unreadFor('p'), 2);
      expect(c.unreadFor('a'), 0);
      expect(c.closed, isTrue);
      expect(c.titleFor('p'), 'Paulo Viana');
      expect(c.titleFor('a'), 'Carlos');
      expect(c.photoFor('p'), 'https://x/a.png');
      final g = classConv();
      expect(g.titleFor(me), 'Iniciante A');
      expect(g.studentCount, 2);
    });

    test('caixa: ordem, filtros, busca e não lidas', () {
      final list = [
        classConv(unread: 3, lastAt: DateTime.utc(2026, 10, 20, 13)),
        directConv(unread: 1, lastAt: DateTime.utc(2026, 10, 20, 14)),
        directConv(
            id: 'd2',
            athleteUid: 'ath-9',
            name: 'Sofia Ramos',
            lastAt: DateTime.utc(2026, 10, 19, 14)),
        directConv(id: 'd3', athleteUid: 'ath-8', name: 'Novo', lastText: null)
            .copyWithLastAt(null),
      ];
      expect(filterInbox(list, viewerUid: me).map((c) => c.id),
          ['d_prof-1_ath-1', 'c_c1', 'd2', 'd3']);
      expect(
        filterInbox(list, viewerUid: me, filter: InboxFilter.unread)
            .map((c) => c.id),
        ['d_prof-1_ath-1', 'c_c1'],
      );
      expect(
        filterInbox(list, viewerUid: me, filter: InboxFilter.classes).single.id,
        'c_c1',
      );
      expect(filterInbox(list, viewerUid: me, query: 'sofia').single.id, 'd2');
      expect(totalUnread(list, me), 4);
      expect(unreadConversations(list, me), 2);
    });

    test('prévia: Você, primeiro nome no grupo, conversa nova', () {
      expect(inboxPreview(directConv(lastSender: me), me),
          'Você: Consigo pagar hoje à noite');
      expect(inboxPreview(classConv(), me), 'Marina: Chego 5 min atrasada!');
      expect(inboxPreview(directConv(lastText: null), me), 'Nova conversa');
    });

    test('modelos: {nome} automático, os outros campos ficam', () {
      expect(
        applyTemplate('Oi {nome}! Seu plano vence {vencimento}.',
            recipientName: 'Paulo Viana'),
        'Oi Paulo! Seu plano vence {vencimento}.',
      );
      expect(applyTemplate('Oi {nome}!'), 'Oi {nome}!');
      expect(templatePlaceholders('Oi Paulo, {data} às {hora}'),
          ['{data}', '{hora}']);
      expect(validateTemplate(title: '', body: 'x'),
          'Dê um nome ao modelo (até 60 caracteres).');
      expect(validateTemplate(title: 'A', body: ' '),
          'Escreva o texto (até 1000 caracteres).');
      final sorted = sortTemplates(const [
        MessageTemplate(id: 'a', title: 'B', body: 'x', uses: 2),
        MessageTemplate(id: 'b', title: 'A', body: 'x', uses: 9),
      ]);
      expect(sorted.map((t) => t.id), ['b', 'a']);
    });

    test('textos, horários e preferências', () {
      expect(cleanMessageText('  '), isNull);
      expect(cleanMessageText(' oi '), 'oi');
      expect(cleanMessageText('x' * 2500)!.length, 2000);
      final now = DateTime.utc(2026, 10, 20, 15);
      expect(inboxTimeLabel(DateTime.utc(2026, 10, 20, 14, 5), now), '11:05');
      expect(inboxTimeLabel(DateTime.utc(2026, 10, 19, 14), now), 'Ontem');
      expect(inboxTimeLabel(DateTime.utc(2026, 10, 16, 14), now), 'Sex');
      expect(inboxTimeLabel(DateTime.utc(2026, 10, 5, 14), now), '05 out');
      expect(messageDayLabel(DateTime.utc(2026, 10, 20, 14), now), 'HOJE');
      expect(
          messageDayLabel(DateTime.utc(2026, 10, 16, 14), now), 'SEX, 16 OUT');
      expect(validatePrefs(const MessagingPrefs(days: [])),
          'Escolha pelo menos um dia.');
      expect(
        validatePrefs(const MessagingPrefs(autoReplyEnabled: true)),
        'Escreva a resposta automática.',
      );
      expect(prefsWholeDay(const MessagingPrefs(from: '06:00', to: '06:00')),
          isTrue);
      expect(
        const MessagingPrefs(days: [3, 1], autoReplyText: ' Oi ').toMap(),
        {
          'quietEnabled': false,
          'from': '06:00',
          'to': '22:00',
          'days': [1, 3],
          'autoReplyEnabled': false,
          'autoReplyText': 'Oi',
        },
      );
      final p = MessagingPrefs.fromMap(const {
        'from': '7h',
        'days': [0, 2, 9]
      });
      expect(p.from, '06:00');
      expect(p.days, [2]);
    });

    test('push, guarda e barra', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'conversation_message',
          'url': '/professor/mensagens/d_p_a',
        }),
        '/professor/mensagens/d_p_a',
      );
      expect(
        resolveNotificationRoute(
            const {'type': 'conversation_message', 'conversationId': 'c_1'}),
        '/mensagens/c_1',
      );
      expect(isAthleteExperiencePath('/mensagens'), isTrue);
      expect(isAthleteExperiencePath('/mensagens/c_1'), isTrue);
      expect(shouldHideProfessorTabBar('/professor/mensagens'), isFalse);
      expect(shouldHideProfessorTabBar('/professor/mensagens/c_1'), isTrue);
    });
  });

  group('D1 caixa do professor', () {
    testWidgets('não lidas, filtro, ponto da carteira e busca', (tester) async {
      final repo = FakeMessagesRepository(conversations: [
        directConv(unread: 1),
        classConv(unread: 3),
        directConv(
          id: 'd_prof-1_ath-paulo',
          athleteUid: 'ath-paulo',
          name: 'Paulo Viana',
          lastAt: DateTime.utc(2026, 10, 19, 14),
        ),
      ]);
      await pumpMessagesApp(
        tester,
        messages: repo,
        wallet: FakeProfessorWalletRepository(students: [walletStudent()]),
        location: AppRoutes.professorMessages,
      );
      expect(find.text('2 NÃO LIDAS'), findsOneWidget);
      expect(
          inside('conversation-unread-c_c1', find.text('3')), findsOneWidget);
      expect(
          find.byKey(const Key('conversation-wallet-dot-d_prof-1_ath-paulo')),
          findsOneWidget);
      expect(find.text('Ontem'), findsOneWidget);

      await tap(tester, find.byKey(const Key('messages-filter-unread')));
      expect(find.byKey(const Key('conversation-d_prof-1_ath-paulo')),
          findsNothing);
      await tap(tester, find.byKey(const Key('messages-filter-all')));
      await tester.enterText(find.byKey(const Key('messages-search')), 'paulo');
      await settleProfessorStudents(tester, 2);
      expect(find.byKey(const Key('conversation-c_c1')), findsNothing);
      expect(find.byKey(const Key('conversation-d_prof-1_ath-paulo')),
          findsOneWidget);
    });

    testWidgets('"+" abre com aluno ou turma pela callable', (tester) async {
      final repo = FakeMessagesRepository(conversations: [directConv()]);
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.professorMessages,
      );
      await tap(tester, find.byKey(const Key('messages-new')));
      expect(find.byKey(const Key('new-message-class-c1')), findsOneWidget);
      expect(find.byKey(const Key('new-message-notices')), findsOneWidget);
      await tap(tester, find.byKey(const Key('new-message-student-ath-1')));
      expect(repo.opened, ['student:ath-1']);
      // Abriu a conversa.
      expect(find.text('João Silva'), findsOneWidget);
      expect(find.byKey(const Key('composer-field')), findsOneWidget);
    });
  });

  group('D2/D3 conversa', () {
    testWidgets('bolhas, separador, nome no grupo, automática e marca lida',
        (tester) async {
      final repo = FakeMessagesRepository(
        conversations: [classConv()],
        messages: {
          'c_c1': [
            msg('m1', 'ath-2', 'Chego 5 min atrasada!',
                name: 'Marina Teles', at: DateTime.utc(2026, 10, 19, 22)),
            msg('m2', me, 'Tranquilo!'),
            msg('m3', me, 'Respondo depois', auto: true),
          ],
        },
      );
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: convPath('c_c1'),
      );
      expect(find.text('2 ALUNOS · ARENA CFC'), findsOneWidget);
      expect(find.text('ONTEM'), findsOneWidget);
      expect(find.text('HOJE'), findsOneWidget);
      expect(inside('message-m1', find.text('Marina Teles')), findsOneWidget);
      expect(inside('message-m3', find.textContaining('resposta automática')),
          findsOneWidget);
      expect(repo.reads, contains('c_c1'));
    });

    testWidgets('enviar pela callable; modelo preenche {nome}', (tester) async {
      final repo = FakeMessagesRepository(
        conversations: [directConv()],
        templates: const [
          MessageTemplate(
              id: 't1',
              title: 'Lembrete',
              body: 'Oi {nome}! Vence {data}.',
              uses: 3),
        ],
      );
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: convPath('d_prof-1_ath-1'),
      );
      await tap(tester, find.byKey(const Key('composer-template-t1')));
      expect(find.text('Oi João! Vence {data}.'), findsOneWidget);
      expect(find.textContaining('Complete antes de enviar: {data}'),
          findsOneWidget);
      expect(repo.usedTemplates, ['t1']);

      await tester.enterText(
          find.byKey(const Key('composer-field')), '  Oi João!  ');
      await settleProfessorStudents(tester, 2);
      await tap(tester, find.byKey(const Key('composer-send')));
      expect(repo.sent.single,
          (conversationId: 'd_prof-1_ath-1', text: 'Oi João!'));
    });

    testWidgets('erro do servidor aparece e o texto volta', (tester) async {
      final repo = FakeMessagesRepository(conversations: [directConv()])
        ..sendError = 'Você está enviando rápido demais';
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: convPath('d_prof-1_ath-1'),
      );
      await tester.enterText(find.byKey(const Key('composer-field')), 'Oi');
      await settleProfessorStudents(tester, 2);
      await tap(tester, find.byKey(const Key('composer-send')));
      expect(find.text('Você está enviando rápido demais'), findsOneWidget);
      expect(find.text('Oi'), findsOneWidget);
    });

    testWidgets('encerrada: histórico sem composer', (tester) async {
      await pumpMessagesApp(
        tester,
        messages: FakeMessagesRepository(
          conversations: [directConv(closed: true)],
          messages: {
            'd_prof-1_ath-1': [msg('m1', 'ath-1', 'Até mais')],
          },
        ),
        location: convPath('d_prof-1_ath-1'),
      );
      expect(find.text('Até mais'), findsOneWidget);
      expect(find.byKey(const Key('conversation-closed')), findsOneWidget);
      expect(find.byKey(const Key('composer-field')), findsNothing);
    });
  });

  group('D6/D7', () {
    testWidgets('criar, editar e apagar modelo', (tester) async {
      final repo = FakeMessagesRepository(templates: const [
        MessageTemplate(
            id: 't1', title: 'Chuva', body: 'Aula de {data}', uses: 4),
      ]);
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.professorMessageTemplates,
      );
      expect(find.text('4 USOS'), findsOneWidget);
      await tap(tester, find.byKey(const Key('templates-new')));
      await tap(tester, find.byKey(const Key('template-save')));
      expect(find.byKey(const Key('template-error')), findsOneWidget);
      Finder field(String k) => find.descendant(
          of: find.byKey(Key(k)), matching: find.byType(TextField));
      await tester.enterText(field('template-title'), 'Boas-vindas');
      await tester.enterText(field('template-body'), 'Bem-vindo, {nome}!');
      await tap(tester, find.byKey(const Key('template-save')));
      expect(repo.savedTemplates.single, {
        'id': null,
        'title': 'Boas-vindas',
        'body': 'Bem-vindo, {nome}!',
        'uses': null,
      });

      await tap(tester, find.byKey(const Key('template-t1')));
      await tap(tester, find.byKey(const Key('template-delete')));
      await tap(tester, find.byKey(const Key('professor-wallet-confirm')));
      expect(repo.deletedTemplates, ['t1']);
    });

    testWidgets('horário: dias, dia inteiro e salvar', (tester) async {
      final repo = FakeMessagesRepository(
        prefs: const MessagingPrefs(from: '06:00', to: '06:00', days: [1]),
      );
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.professorServiceHours,
      );
      expect(find.byKey(const Key('hours-whole-day')), findsOneWidget);
      await tap(tester, find.byKey(const Key('hours-day-1')));
      await tap(tester, find.byKey(const Key('hours-save')));
      expect(find.text('Escolha pelo menos um dia.'), findsOneWidget);
      expect(repo.savedPrefs, isEmpty);

      await tap(tester, find.byKey(const Key('hours-day-6')));
      await tap(tester, inside('hours-quiet', find.byType(Switch)));
      await tap(tester, find.byKey(const Key('hours-save')));
      expect(repo.savedPrefs.single, {
        'quietEnabled': true,
        'from': '06:00',
        'to': '06:00',
        'days': [6],
        'autoReplyEnabled': false,
        'autoReplyText': '',
      });
    });
  });

  group('atalhos', () {
    testWidgets('Mensagem na tela do aluno abre a conversa', (tester) async {
      final repo = FakeMessagesRepository(conversations: [directConv()]);
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.professorStudent
            .replaceAll(':arenaId', 'arena-cfc')
            .replaceAll(':studentId', 's1'),
      );
      await tap(tester, find.byKey(const Key('professor-student-message')));
      expect(repo.opened, ['student:ath-1']);
      expect(find.byKey(const Key('composer-field')), findsOneWidget);
    });
  });

  group('aluno', () {
    testWidgets('caixa do atleta: "+" lista os professores', (tester) async {
      final repo = FakeMessagesRepository(professors: const [
        MyProfessor(professorUid: 'prof-x', name: 'Carlos Professor'),
      ]);
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.athleteMessages,
      );
      expect(find.byKey(const Key('messages-empty')), findsOneWidget);
      expect(find.byKey(const Key('messages-menu')), findsNothing);
      await tap(tester, find.byKey(const Key('messages-new')));
      await tap(tester, find.byKey(const Key('new-message-professor-prof-x')));
      expect(repo.opened, ['professor:prof-x']);
    });

    testWidgets('"+" lista o centro: canal com a recepção ou o professor', (
      tester,
    ) async {
      final repo = FakeMessagesRepository()
        ..centerContacts = const CenterChatContacts(
          centerName: 'CT Maré Alta',
          desk: true,
          professors: [MyProfessor(professorUid: 'tm', name: 'Thiago')],
        );
      final router = await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.athleteMessages,
        centers: const [TrainingCenterLink(centerId: 'c1', name: 'CT Maré Alta')],
      );
      await tap(tester, find.byKey(const Key('messages-new')));
      await tap(tester, find.byKey(const Key('new-message-center-c1')));
      expect(find.byKey(const Key('center-chat-contacts-sheet')), findsOneWidget);
      expect(find.byKey(const Key('center-chat-professor-tm')), findsOneWidget);
      await tap(tester, find.byKey(const Key('center-chat-desk')));
      expect(repo.opened, ['desk:c1']);
      expect(router.state.uri.path, '/mensagens/cd_c1_$me');
    });

    testWidgets('centro: o aluno começa com o professor dele', (tester) async {
      final repo = FakeMessagesRepository()
        ..centerContacts = const CenterChatContacts(
          centerName: 'CT Maré Alta',
          desk: false,
          professors: [MyProfessor(professorUid: 'tm', name: 'Thiago')],
        );
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.athleteMessages,
        centers: const [TrainingCenterLink(centerId: 'c1', name: 'CT Maré Alta')],
      );
      await tap(tester, find.byKey(const Key('messages-new')));
      await tap(tester, find.byKey(const Key('new-message-center-c1')));
      expect(find.byKey(const Key('center-chat-desk')), findsNothing);
      await tap(tester, find.byKey(const Key('center-chat-professor-tm')));
      expect(repo.opened, ['center-staff:c1:tm']);
    });
  });

  group('canal com o centro', () {
    Conversation desk() => Conversation.fromMap('cd_c1_lucas', {
      'kind': 'center_desk',
      'professorUid': '',
      'athleteUid': 'lucas',
      'centerId': 'c1',
      'title': 'CT Maré Alta',
      'memberIds': ['lucas', 'owner', 'recep'],
      'memberNames': {
        'lucas': 'Lucas Prado',
        'owner': 'Renata',
        'recep': 'Camila',
      },
    });

    test('aluno vê o centro; a equipe vê o aluno e quem respondeu', () {
      final c = desk();
      expect(c.isCenterDesk, isTrue);
      expect(c.titleFor('lucas'), 'CT Maré Alta');
      expect(c.titleFor('recep'), 'Lucas Prado');
      expect(c.showsSenderNames, isTrue);
      expect(c.centerStaffSide('recep'), isTrue);
      expect(c.centerStaffSide('lucas'), isFalse);
    });
  });
}

extension on Conversation {
  Conversation copyWithLastAt(DateTime? at) => Conversation(
        id: id,
        kind: kind,
        professorUid: professorUid,
        athleteUid: athleteUid,
        memberIds: memberIds,
        memberNames: memberNames,
        lastMessage: lastMessage,
        lastAt: at,
        unread: unread,
      );
}
