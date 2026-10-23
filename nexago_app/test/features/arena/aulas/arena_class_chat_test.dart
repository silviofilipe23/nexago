import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/aulas/arena_class_messages_page.dart';
import 'package:nexago_app/features/messages/application/messages_providers.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';

import '../../messages/messages_test_support.dart'
    show FakeMessagesRepository, me;
import 'arena_class_fixtures.dart';
import 'aulas_pump.dart';
import 'fake_arena_class_enrollment_repository.dart';
import 'fake_arena_class_repository.dart';

/// Chat das Aulas da arena: "Mensagem" e "Cobrar" pelo app quando o aluno tem
/// conta; WhatsApp quando não tem.

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

Conversation _conv({
  String id = 's_a1_${me}_u1',
  String arenaId = 'a1',
  String staffUid = me,
  String athleteUid = 'u1',
  String name = 'Carla Dias',
  int unread = 0,
}) =>
    Conversation(
      id: id,
      kind: ConversationKind.arenaStudent,
      professorUid: staffUid,
      athleteUid: athleteUid,
      arenaId: arenaId,
      title: 'Arena Sol',
      memberIds: [staffUid, athleteUid],
      memberNames: {staffUid: 'Ana', athleteUid: name},
      lastMessage: ConversationPreview(text: 'Pago!', senderUid: athleteUid),
      lastAt: DateTime.utc(2026, 10, 19, 15),
      unread: {staffUid: unread},
    );

List<String> _mockLauncher(WidgetTester tester) {
  final launched = <String>[];
  const channel = MethodChannel('plugins.flutter.io/url_launcher');
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    channel,
    (call) async {
      if (call.method == 'launch') {
        launched.add((call.arguments as Map)['url'] as String);
      }
      return true;
    },
  );
  addTearDown(() => tester.binding.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, null));
  return launched;
}

String _composer(WidgetTester tester) =>
    tester.widget<TextField>(find.byType(TextField).last).controller!.text;

void main() {
  group('domínio', () {
    test('kind arena_student: o aluno vê de qual arena é quem escreve', () {
      final c = Conversation.fromMap('s_a1_ana_u1', {
        'kind': 'arena_student',
        'professorUid': 'ana',
        'athleteUid': 'u1',
        'arenaId': 'a1',
        'title': 'Arena Sol',
        'memberIds': ['ana', 'u1'],
        'memberNames': {'ana': 'Ana', 'u1': 'Carla'},
      });
      expect(c.isArenaStudent, isTrue);
      expect(c.titleFor('u1'), 'Ana · Arena Sol');
      expect(c.titleFor('ana'), 'Carla');
      expect(c.viewedByStaff('ana'), isTrue);
      expect(c.viewedByStaff('u1'), isFalse);
    });

    test('caixa das Aulas: só as conversas desta arena abertas por mim', () {
      final list = arenaClassConversations(
        [
          _conv(),
          _conv(id: 'outra-arena', arenaId: 'a9'),
          _conv(id: 'de-outra-pessoa', staffUid: 'rui'),
          _conv(id: 'direta').copyWithKind(ConversationKind.direct),
        ],
        arenaId: 'a1',
        uid: me,
      );
      expect(list.map((c) => c.id), ['s_a1_${me}_u1']);
    });
  });

  group('Mensalidades · Cobrar', () {
    testWidgets('com conta: abre o chat com a mensagem pronta no composer',
        (tester) async {
      final launched = _mockLauncher(tester);
      final messages = FakeMessagesRepository(conversations: [_conv()]);
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          charges: [charge(athleteId: 'u1', dueDate: '2026-10-12')],
        ),
        initial: '/arena/classes/charges',
        overrides: [
          messagesRepositoryProvider.overrideWithValue(messages),
          messagesUidProvider.overrideWithValue(me),
        ],
      );

      await tester.tap(find.text('Cobrar'));
      await _settle(tester);

      expect(messages.opened, ['arenaStudent:a1:u1']);
      expect(launched, isEmpty);
      expect(_composer(tester), contains('Carla'));
      expect(_composer(tester), contains('320'));
    });

    testWidgets('sem conta: segue no WhatsApp', (tester) async {
      final launched = _mockLauncher(tester);
      final messages = FakeMessagesRepository();
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(
          charges: [charge(dueDate: '2026-10-12')],
        ),
        initial: '/arena/classes/charges',
        overrides: [
          messagesRepositoryProvider.overrideWithValue(messages),
          messagesUidProvider.overrideWithValue(me),
        ],
      );

      await tester.tap(find.text('Cobrar'));
      await _settle(tester);

      expect(messages.opened, isEmpty);
      expect(launched.single, startsWith('https://wa.me/5562999998888?text='));
    });
  });

  group('Aluno · Mensagem', () {
    testWidgets('com conta: "Mensagem" abre a conversa (sem WhatsApp)',
        (tester) async {
      final messages = FakeMessagesRepository(conversations: [_conv()]);
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(
          classes: [arenaClass(id: 'c1', name: 'Iniciante A')],
          students: [student('u1', 'Carla Dias', enrollmentId: 'e1')],
        ),
        enrollmentRepo:
            FakeArenaClassEnrollmentRepository(enrollments: [enrollment()]),
        initial: '/arena/classes/student/u1',
        overrides: [
          messagesRepositoryProvider.overrideWithValue(messages),
          messagesUidProvider.overrideWithValue(me),
        ],
      );

      expect(find.text('WhatsApp'), findsNothing);
      await tester.tap(find.byKey(const Key('arena-class-student-message')));
      await _settle(tester);

      expect(messages.opened, ['arenaStudent:a1:u1']);
      // Sem rascunho: a conversa abre com o composer vazio.
      expect(_composer(tester), isEmpty);
      expect(find.text('ALUNO · ARENA SOL'), findsOneWidget);
    });

    testWidgets('sem conta: só o WhatsApp', (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(
          classes: [arenaClass(id: 'c1', name: 'Iniciante A')],
          students: [student('s9', 'Caio Lima', enrollmentId: 'e1')],
        ),
        enrollmentRepo: FakeArenaClassEnrollmentRepository(enrollments: [
          enrollment(studentId: 's9', athleteId: null, name: 'Caio Lima'),
        ]),
        initial: '/arena/classes/student/s9',
      );

      expect(find.text('WhatsApp'), findsOneWidget);
      expect(
          find.byKey(const Key('arena-class-student-message')), findsNothing);
    });
  });

  group('Mensagens das Aulas', () {
    testWidgets('lista as conversas e o cabeçalho das Aulas marca não lidas',
        (tester) async {
      final messages = FakeMessagesRepository(conversations: [
        _conv(unread: 2),
        _conv(id: 'outra-arena', arenaId: 'a9', name: 'Zeca'),
      ]);
      final router = await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        role: ArenaStaffRole.gestor,
        overrides: [
          messagesRepositoryProvider.overrideWithValue(messages),
          messagesUidProvider.overrideWithValue(me),
        ],
      );

      expect(find.byKey(const Key('arena-classes-messages-unread')),
          findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Mensagens'));
      await _settle(tester);

      expect(find.text('Carla Dias'), findsOneWidget);
      expect(find.text('Zeca'), findsNothing);
      await tester.tap(find.text('Carla Dias'));
      await _settle(tester);
      expect(router.state.uri.path, '/arena/classes/messages/s_a1_${me}_u1');
    });

    testWidgets('vazia explica de onde nasce a conversa', (tester) async {
      await pumpAulas(
        tester,
        repo: FakeArenaClassRepository(),
        initial: '/arena/classes/messages',
        overrides: [
          messagesRepositoryProvider
              .overrideWithValue(FakeMessagesRepository()),
          messagesUidProvider.overrideWithValue(me),
        ],
      );
      expect(
          find.byKey(const Key('arena-class-messages-empty')), findsOneWidget);
    });
  });
}

extension on Conversation {
  Conversation copyWithKind(ConversationKind kind) => Conversation(
        id: id,
        kind: kind,
        professorUid: professorUid,
        athleteUid: athleteUid,
        arenaId: arenaId,
        memberIds: memberIds,
      );
}
