import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart'
    show athleteTrainingCentersProvider;
import 'package:nexago_app/features/athlete_training/domain/training_center.dart'
    show TrainingCenterLink;
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/messages/domain/messages.dart';
import 'package:nexago_app/features/messages/infrastructure/messages_repository.dart';
import 'package:nexago_app/features/messages/presentation/conversation_page.dart';
import 'package:nexago_app/features/messages/presentation/messages_inbox_page.dart';
import 'package:nexago_app/features/messages/presentation/messaging_settings_pages.dart';
import 'package:nexago_app/features/professor_links/application/professor_links_providers.dart';

import '../professor_links/professor_links_test_support.dart'
    show FakeProfessorLinksRepository;

import '../professor_mode/professor_availability_test_support.dart'
    show FakeProfessorAvailabilityRepository;
import '../professor_mode/professor_students_test_support.dart';
import '../professor_mode/professor_wallet_test_support.dart';

/// Apoio dos testes de Mensagens (fase 7). Agora = Ter 20/10/2026 12:00 SP.
final messagesNow = DateTime.utc(2026, 10, 20, 15);
const me = professorStudentsTestUid;

Conversation directConv({
  String id = 'd_prof-1_ath-1',
  String athleteUid = 'ath-1',
  String name = 'João Silva',
  String? lastText = 'Consigo pagar hoje à noite',
  String lastSender = 'ath-1',
  DateTime? lastAt,
  int unread = 0,
  bool closed = false,
}) =>
    Conversation(
      id: id,
      kind: ConversationKind.direct,
      professorUid: me,
      athleteUid: athleteUid,
      memberIds: [me, athleteUid],
      memberNames: {me: 'Carlos', athleteUid: name},
      lastMessage: lastText == null
          ? null
          : ConversationPreview(text: lastText, senderUid: lastSender),
      lastAt: lastAt ?? DateTime.utc(2026, 10, 20, 14),
      unread: {me: unread},
      closed: closed,
    );

Conversation classConv({
  String id = 'c_c1',
  String title = 'Iniciante A',
  int unread = 0,
  DateTime? lastAt,
}) =>
    Conversation(
      id: id,
      kind: ConversationKind.classGroup,
      professorUid: me,
      classId: 'c1',
      arenaName: 'Arena CFC',
      title: title,
      memberIds: const [me, 'ath-1', 'ath-2'],
      memberNames: const {
        me: 'Carlos',
        'ath-1': 'João Silva',
        'ath-2': 'Marina Teles'
      },
      lastMessage: const ConversationPreview(
        text: 'Chego 5 min atrasada!',
        senderUid: 'ath-2',
        senderName: 'Marina Teles',
      ),
      lastAt: lastAt ?? DateTime.utc(2026, 10, 20, 13),
      unread: {me: unread},
    );

/// Canal com a gestão da Arena CFC (D4): o professor e a Ana, da gestão.
Conversation arenaConv({
  String arenaId = 'arena-cfc',
  String arenaName = 'Arena CFC',
  int unread = 0,
  bool closed = false,
  DateTime? lastAt,
  String staffUid = 'staff-ana',
}) =>
    Conversation(
      id: 'a_${arenaId}_$me',
      kind: ConversationKind.arena,
      professorUid: me,
      arenaId: arenaId,
      arenaName: arenaName,
      linkId: '${arenaId}_$me',
      title: 'Gestão $arenaName',
      memberIds: [me, staffUid],
      memberNames: {me: 'Carlos', staffUid: 'Ana Souza · gestão'},
      lastMessage: ConversationPreview(
        text: 'Quadra 2 em manutenção amanhã',
        senderUid: staffUid,
        senderName: 'Ana Souza · gestão',
      ),
      lastAt: lastAt ?? DateTime.utc(2026, 10, 20, 12),
      unread: {me: unread},
      closed: closed,
    );

ChatMessage msg(
  String id,
  String sender,
  String text, {
  DateTime? at,
  String name = '',
  bool auto = false,
  ChatMessageCard? card,
}) =>
    ChatMessage(
      id: id,
      senderUid: sender,
      senderName: name,
      text: text,
      createdAt: at ?? DateTime.utc(2026, 10, 20, 14),
      auto: auto,
      card: card,
    );

class FakeMessagesRepository implements MessagesRepository {
  FakeMessagesRepository({
    List<Conversation>? conversations,
    Map<String, List<ChatMessage>>? messages,
    List<MessageTemplate>? templates,
    this.prefs = const MessagingPrefs(),
    List<MyProfessor>? professors,
  })  : conversations = conversations ?? [],
        messages = messages ?? {},
        templates = templates ?? [],
        professors = professors ?? [];

  List<Conversation> conversations;
  Map<String, List<ChatMessage>> messages;
  List<MessageTemplate> templates;
  MessagingPrefs prefs;
  List<MyProfessor> professors;
  String? sendError;
  final sent = <({String conversationId, String text})>[];
  final reads = <String>[];
  final opened = <String>[];
  final savedTemplates = <Map<String, Object?>>[];
  final deletedTemplates = <String>[];
  final usedTemplates = <String>[];
  final savedPrefs = <Map<String, Object?>>[];
  final _changes = StreamController<void>.broadcast();

  Stream<T> _watch<T>(T Function() read) async* {
    yield read();
    await for (final _ in _changes.stream) {
      yield read();
    }
  }

  void emit() => _changes.add(null);

  @override
  Stream<List<Conversation>> watchInbox(String uid) => _watch(() => [
        for (final c in conversations)
          if (c.memberIds.contains(uid)) c,
      ]);

  @override
  Stream<Conversation?> watchConversation(String id) => _watch(() {
        for (final c in conversations) {
          if (c.id == id) return c;
        }
        return null;
      });

  @override
  Stream<List<ChatMessage>> watchMessages(String id) =>
      _watch(() => List.of(messages[id] ?? const []));

  @override
  Future<String> send(String conversationId, String text) async {
    final e = sendError;
    if (e != null) throw MessagesException(e);
    sent.add((conversationId: conversationId, text: text));
    return 'm${sent.length}';
  }

  @override
  Future<String> openProfessorConversation(String athleteId) async {
    opened.add('student:$athleteId');
    return 'd_${me}_$athleteId';
  }

  @override
  Future<String> openStudentConversation(String professorUid) async {
    opened.add('professor:$professorUid');
    return 'd_${professorUid}_$me';
  }

  @override
  Future<String> openClassConversation(String classId) async {
    opened.add('class:$classId');
    return 'c_$classId';
  }

  CenterChatContacts centerContacts = const CenterChatContacts(
    centerName: 'CT Maré Alta',
    desk: true,
  );

  @override
  Future<CenterChatContacts> getCenterChatContacts(String centerId) async =>
      centerContacts;

  @override
  Future<String> openCenterDesk(String centerId) async {
    opened.add('desk:$centerId');
    return 'cd_${centerId}_$me';
  }

  @override
  Future<String> openCenterStaffConversation(
    String centerId,
    String staffUid,
  ) async {
    opened.add('center-staff:$centerId:$staffUid');
    return 't_${centerId}_${staffUid}_$me';
  }

  @override
  Future<String> openCenterConversation(String centerId, String studentId) async {
    opened.add('center:$centerId:$studentId');
    return 't_${centerId}_${me}_$studentId';
  }

  @override
  Future<String> openArenaChannel(String arenaId, {String? professorUid}) async {
    final professor = professorUid ?? me;
    opened.add('arena:$arenaId${professorUid == null ? '' : ':$professorUid'}');
    return 'a_${arenaId}_$professor';
  }

  @override
  Future<void> markRead(String conversationId) async =>
      reads.add(conversationId);

  @override
  Future<List<MyProfessor>> getMyProfessors() async => professors;

  @override
  Stream<List<MessageTemplate>> watchTemplates(String uid) =>
      _watch(() => List.of(templates));

  @override
  Future<void> saveTemplate(
    String uid, {
    String? templateId,
    required String title,
    required String body,
    int? uses,
  }) async {
    savedTemplates.add({
      'id': templateId,
      'title': title,
      'body': body,
      'uses': uses,
    });
  }

  @override
  Future<void> deleteTemplate(String uid, String templateId) async =>
      deletedTemplates.add(templateId);

  @override
  Future<void> countTemplateUse(String uid, MessageTemplate template) async =>
      usedTemplates.add(template.id);

  @override
  Stream<MessagingPrefs> watchPrefs(String uid) => _watch(() => prefs);

  @override
  Future<void> savePrefs(String uid, MessagingPrefs p) async =>
      savedPrefs.add(p.toMap());
}

List<RouteBase> get messagesRoutes => [
      GoRoute(
        path: AppRoutes.professorMessages,
        name: AppRouteNames.professorMessages,
        builder: (_, __) => const MessagesInboxPage(professorMode: true),
      ),
      GoRoute(
        path: AppRoutes.professorMessageTemplates,
        name: AppRouteNames.professorMessageTemplates,
        builder: (_, __) => const MessageTemplatesPage(),
      ),
      GoRoute(
        path: AppRoutes.professorServiceHours,
        name: AppRouteNames.professorServiceHours,
        builder: (_, __) => const ServiceHoursPage(),
      ),
      GoRoute(
        path: AppRoutes.professorConversation,
        name: AppRouteNames.professorConversation,
        builder: (_, state) => ConversationPage(
          conversationId: state.pathParameters['conversationId'] ?? '',
          professorMode: true,
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteMessages,
        name: AppRouteNames.athleteMessages,
        builder: (_, __) => const MessagesInboxPage(professorMode: false),
      ),
      GoRoute(
        path: AppRoutes.athleteConversation,
        name: AppRouteNames.athleteConversation,
        builder: (_, state) => ConversationPage(
          conversationId: state.pathParameters['conversationId'] ?? '',
          professorMode: false,
        ),
      ),
    ];

Future<GoRouter> pumpMessagesApp(
  WidgetTester tester, {
  required FakeMessagesRepository messages,
  required String location,
  FakeProfessorWalletRepository? wallet,
  FakeProfessorLinksRepository? links,
  FakeProfessorAvailabilityRepository? availability,
  String uid = professorStudentsTestUid,
  List<RouteBase> extraRoutes = const [],
  List<TrainingCenterLink> centers = const [],
}) =>
    pumpProfessorStudentsApp(
      tester,
      repo: FakeProfessorStudentsRepository([professorStudentsSnapshot()]),
      walletRepo: wallet,
      availabilityRepo: availability,
      uid: uid,
      location: location,
      extraRoutes: [
        ...messagesRoutes,
        ...professorWalletRoutes,
        ...extraRoutes,
      ],
      overrides: [
        messagesRepositoryProvider.overrideWithValue(messages),
        professorLinksRepositoryProvider
            .overrideWithValue(links ?? FakeProfessorLinksRepository()),
        professorLinksClockProvider.overrideWithValue(() => messagesNow),
        athleteTrainingCentersProvider.overrideWith((ref) async => centers),
      ],
    );
