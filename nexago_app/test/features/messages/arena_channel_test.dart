import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/arena/domain/arena_route_guard.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';
import 'package:nexago_app/features/messages/infrastructure/messages_repository.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';
import 'package:nexago_app/features/professor_links/domain/arena_professor_link.dart';
import 'package:nexago_app/features/professor_links/presentation/widgets/professor_links_ui.dart';

import '../arena/presentation/professionals/arena_professionals_test_support.dart';
import '../professor_links/professor_links_test_support.dart'
    show FakeProfessorLinksRepository, loadProfessorLinksFonts, professorLink;
import '../professor_mode/professor_students_test_support.dart';
import 'messages_test_support.dart';

/// D4 Canal com a gestão da arena: domínio, caixa e "+" do professor, a
/// conversa dos dois lados, o "Conversar" do vínculo e o push.

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await settleProfessorStudents(tester);
}

Finder inside(String key, Finder matching) =>
    find.descendant(of: find.byKey(Key(key)), matching: matching);

void main() {
  setUpAll(loadProfessorLinksFonts);

  group('domínio', () {
    test('lê kind arena com arena, vínculo e o título de cada lado', () {
      final c = Conversation.fromMap('a_arena-cfc_p', {
        'kind': 'arena',
        'professorUid': 'p',
        'arenaId': 'arena-cfc',
        'arenaName': 'Arena CFC',
        'linkId': 'arena-cfc_p',
        'title': 'Gestão Arena CFC',
        'memberIds': ['p', 'ana'],
        'memberNames': {'p': 'Thiago Mendes', 'ana': 'Ana Souza · gestão'},
        'memberPhotos': {'p': 'https://x/p.png', 'ana': null},
        'lastMessage': {
          'text': 'Quadra 2 em manutenção',
          'senderUid': 'ana',
          'senderName': 'Ana Souza · gestão',
        },
        'lastAt': Timestamp.fromDate(DateTime.utc(2026, 10, 20, 14)),
        'unread': {'p': 1},
        'closed': false,
      });
      expect(c.kind, ConversationKind.arena);
      expect(c.isArena, isTrue);
      expect(c.isGroup, isFalse);
      expect(c.showsSenderNames, isTrue);
      expect(c.linkId, 'arena-cfc_p');
      expect(c.arenaId, 'arena-cfc');
      expect(c.titleFor('p'), 'Gestão Arena CFC');
      expect(c.titleFor('ana'), 'Thiago Mendes');
      expect(c.photoFor('p'), isNull);
      expect(c.photoFor('ana'), 'https://x/p.png');
      expect(c.viewedByArenaStaff('p'), isFalse);
      expect(c.viewedByArenaStaff('ana'), isTrue);
      expect(inboxPreview(c, 'p'), 'Ana: Quadra 2 em manutenção');
      expect(ConversationKind.parse('class'), ConversationKind.classGroup);
      expect(ConversationKind.parse('direct'), ConversationKind.direct);
      expect(ConversationKind.parse(null), ConversationKind.direct);
      expect(arenaChannelConversationId('arena-cfc_p'), 'a_arena-cfc_p');
    });

    test('filtro Arenas só mostra os canais com a gestão', () {
      final list = [directConv(), classConv(), arenaConv()];
      expect(
        filterInbox(list, viewerUid: me, filter: InboxFilter.arenas).single.id,
        'a_arena-cfc_$me',
      );
      expect(filterInbox(list, viewerUid: me, query: 'gestão').single.isArena,
          isTrue);
    });
  });

  group('D1/D5 professor', () {
    testWidgets('caixa mostra o canal com a marca da arena e o chip Arenas',
        (tester) async {
      final repo = FakeMessagesRepository(conversations: [
        directConv(),
        arenaConv(unread: 1),
      ]);
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.professorMessages,
      );
      final id = 'a_arena-cfc_$me';
      expect(inside('conversation-$id', find.text('Gestão Arena CFC')),
          findsOneWidget);
      expect(inside('conversation-$id', find.byType(ProfessorArenaMark)),
          findsOneWidget);
      expect(
          inside(
              'conversation-$id',
              find.text('Ana: Quadra 2 em '
                  'manutenção amanhã')),
          findsOneWidget);

      await tap(tester, find.byKey(const Key('messages-filter-arenas')));
      expect(find.byKey(Key('conversation-$id')), findsOneWidget);
      expect(
          find.byKey(const Key('conversation-d_prof-1_ath-1')), findsNothing);

      await tap(tester, find.byKey(Key('conversation-$id')));
      expect(find.text('CANAL COM A ARENA · EQUIPE'), findsOneWidget);
      expect(find.text('Mensagem para a gestão'), findsOneWidget);
      expect(repo.reads, contains(id));
    });

    testWidgets('"+" lista só as arenas com vínculo ativo e abre o canal',
        (tester) async {
      final repo = FakeMessagesRepository(conversations: [
        arenaConv(arenaId: 'arena-sul', arenaName: 'Arena Sul'),
      ]);
      await pumpMessagesApp(
        tester,
        messages: repo,
        links: FakeProfessorLinksRepository(links: [
          professorLink(),
          professorLink(
            arenaId: 'arena-lagoa',
            arenaName: 'Arena Lagoa',
            status: ArenaProfessorLinkStatus.suspended,
          ),
        ]),
        location: AppRoutes.professorMessages,
      );
      await tap(tester, find.byKey(const Key('messages-new')));
      expect(
          find.byKey(const Key('new-message-arena-arena-sul')), findsOneWidget);
      expect(
          find.byKey(const Key('new-message-arena-arena-lagoa')), findsNothing);

      await tap(tester, find.byKey(const Key('new-message-arena-arena-sul')));
      expect(repo.opened, ['arena:arena-sul']);
      expect(find.text('Gestão Arena Sul'), findsOneWidget);
      expect(find.byKey(const Key('composer-field')), findsOneWidget);
    });
  });

  group('D4 conversa', () {
    testWidgets('bolha recebida leva o nome da gestão; envio pela callable',
        (tester) async {
      final repo = FakeMessagesRepository(
        conversations: [arenaConv()],
        messages: {
          'a_arena-cfc_$me': [
            msg('m1', 'staff-ana', 'Sua turma foi para a Quadra 3.',
                name: 'Ana Souza · gestão'),
            msg('m2', me, 'Fechado, obrigado Ana!'),
          ],
        },
      );
      await pumpMessagesApp(
        tester,
        messages: repo,
        location: AppRoutes.professorConversation
            .replaceAll(':conversationId', 'a_arena-cfc_$me'),
      );
      expect(find.text('Gestão Arena CFC'), findsOneWidget);
      expect(inside('message-m1', find.text('Ana Souza · gestão')),
          findsOneWidget);
      expect(inside('message-m2', find.text('Carlos')), findsNothing);

      await tester.enterText(find.byKey(const Key('composer-field')), 'Ok!');
      await settleProfessorStudents(tester, 2);
      await tap(tester, find.byKey(const Key('composer-send')));
      expect(
          repo.sent.single, (conversationId: 'a_arena-cfc_$me', text: 'Ok!'));
    });

    testWidgets('vínculo encerrado: canal fechado, sem composer',
        (tester) async {
      await pumpMessagesApp(
        tester,
        messages:
            FakeMessagesRepository(conversations: [arenaConv(closed: true)]),
        location: AppRoutes.professorConversation
            .replaceAll(':conversationId', 'a_arena-cfc_$me'),
      );
      expect(find.byKey(const Key('conversation-closed')), findsOneWidget);
      expect(
          find.textContaining('o vínculo com a arena acabou'), findsOneWidget);
      expect(find.byKey(const Key('composer-field')), findsNothing);
    });
  });

  group('lado da arena', () {
    Conversation staffConv() => Conversation(
          id: 'a_${arenaTestId}_marcos',
          kind: ConversationKind.arena,
          professorUid: 'marcos',
          arenaId: arenaTestId,
          arenaName: arenaTestName,
          linkId: '${arenaTestId}_marcos',
          title: 'Gestão $arenaTestName',
          memberIds: const ['marcos', 'gestor-1'],
          memberNames: const {
            'marcos': 'Marcos Lima',
            'gestor-1': 'Ana Souza · gestão',
          },
        );

    testWidgets('"Conversar" abre o canal do vínculo ativo', (tester) async {
      final messages = FakeMessagesRepository(conversations: [staffConv()]);
      final link = marcosActive();
      await pumpArenaProfessionalsApp(
        tester,
        repo: FakeArenaProfessionalsRepository(links: [link]),
        location:
            AppRoutes.arenaProfessionalDetail.replaceAll(':linkId', link.id),
        overrides: [
          messagesRepositoryProvider.overrideWithValue(messages),
          professorLinksUidProvider.overrideWithValue('gestor-1'),
        ],
      );
      expect(
          find.byKey(const Key('arena-professor-converse-hint')), findsNothing);
      final button = find.byKey(const Key('arena-professor-converse'));
      await tester.ensureVisible(button);
      await tester.tap(button);
      await settleProfessorLinks(tester, 12);

      expect(messages.opened, ['arena:$arenaTestId:marcos']);
      expect(find.text('Marcos Lima'), findsWidgets);
      expect(find.text('CANAL COM O PROFESSOR · ARENA CFC'), findsOneWidget);
      expect(find.text('Mensagem para o professor'), findsOneWidget);
      expect(messages.reads, contains('a_${arenaTestId}_marcos'));
    });

    testWidgets('vínculo não ativo: "Conversar" desligado', (tester) async {
      final messages = FakeMessagesRepository();
      final link = brunaSuspended();
      await pumpArenaProfessionalsApp(
        tester,
        repo: FakeArenaProfessionalsRepository(links: [link]),
        location:
            AppRoutes.arenaProfessionalDetail.replaceAll(':linkId', link.id),
        overrides: [messagesRepositoryProvider.overrideWithValue(messages)],
      );
      final button = find.descendant(
        of: find.byKey(const Key('arena-professor-converse')),
        matching: find.byType(OutlinedButton),
      );
      expect(tester.widget<OutlinedButton>(button).onPressed, isNull);
      expect(find.byKey(const Key('arena-professor-converse-hint')),
          findsOneWidget);
      await tester.ensureVisible(button);
      await tester.tap(button, warnIfMissed: false);
      await settleProfessorLinks(tester);
      expect(messages.opened, isEmpty);
    });

    test('rota do canal é do painel e exige a área perfil', () {
      const path = '/arena/professionals/arena-cfc_marcos/conversa';
      expect(
        AppRoutes.arenaProfessionalConversation
            .replaceAll(':linkId', 'arena-cfc_marcos'),
        path,
      );
      expect(isArenaManagerPanelPath(path), isTrue);
      expect(arenaAreaForPath(path), ArenaArea.perfil);
    });
  });

  group('push', () {
    test('mensagem do canal: a gestão abre pelo vínculo', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'conversation_message',
          'conversationId': 'a_arena-cfc_p',
          'url': '/arena/professionals/arena-cfc_p/conversa',
          'webUrl': '/painel/profissionais/arena-cfc_p?aba=mensagens',
        }),
        '/arena/professionals/arena-cfc_p/conversa',
      );
      expect(
        resolveNotificationRoute(const {
          'type': 'conversation_message',
          'conversationId': 'a_arena-cfc_p',
          'url': '/professor/mensagens/a_arena-cfc_p',
        }),
        '/professor/mensagens/a_arena-cfc_p',
      );
    });

    test('comunicado da arena abre o detalhe (não o vínculo)', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'arena_professor_notice',
          'noticeId': 'an1',
          'arenaId': 'arena-cfc',
          'url': '/professor/mais/comunicados/arena/an1',
        }),
        '/professor/mais/comunicados/arena/an1',
      );
      expect(
        resolveNotificationRoute(const {
          'type': 'arena_professor_notice',
          'noticeId': 'an1',
          'arenaId': 'arena-cfc',
        }),
        '/professor/mais/comunicados/arena/an1',
      );
      expect(
        resolveNotificationRoute(const {'type': 'arena_professor_notice'}),
        AppRoutes.professorNotices,
      );
      // O vínculo segue no ramo dele.
      expect(
        resolveNotificationRoute(const {
          'type': 'arena_professor_request',
          'linkId': 'arena-cfc_p',
        }),
        '/arena/professionals/arena-cfc_p',
      );
    });
  });
}
