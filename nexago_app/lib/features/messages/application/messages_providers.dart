import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../professor_links/application/professor_links_providers.dart';
import '../domain/messages.dart';
import '../infrastructure/messages_repository.dart';

export '../infrastructure/messages_repository.dart'
    show messagesRepositoryProvider;

/// Mensagens (professor e aluno), em tempo real. Sem login, tudo vazio —
/// e sem tocar no Firestore.

/// Quem está logado (o mesmo uid dos vínculos).
final messagesUidProvider = Provider<String>((ref) {
  return ref.watch(professorLinksUidProvider);
});

final inboxProvider = StreamProvider.autoDispose<List<Conversation>>((ref) {
  final uid = ref.watch(messagesUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref.watch(messagesRepositoryProvider).watchInbox(uid);
});

/// Não lidas somadas (badge da aba e do cabeçalho do atleta).
final unreadMessagesCountProvider = Provider.autoDispose<int>((ref) {
  final uid = ref.watch(messagesUidProvider);
  final list = ref.watch(inboxProvider).valueOrNull ?? const [];
  return totalUnread(list, uid);
});

final inboxFilterProvider =
    StateProvider.autoDispose<InboxFilter>((ref) => InboxFilter.all);

final conversationProvider =
    StreamProvider.autoDispose.family<Conversation?, String>((ref, id) {
  if (ref.watch(messagesUidProvider).isEmpty || id.isEmpty) {
    return Stream.value(null);
  }
  return ref.watch(messagesRepositoryProvider).watchConversation(id);
});

final conversationMessagesProvider =
    StreamProvider.autoDispose.family<List<ChatMessage>, String>((ref, id) {
  if (ref.watch(messagesUidProvider).isEmpty || id.isEmpty) {
    return Stream.value(const []);
  }
  return ref.watch(messagesRepositoryProvider).watchMessages(id);
});

/// Respostas rápidas do professor, mais usadas primeiro.
final messageTemplatesProvider =
    StreamProvider.autoDispose<List<MessageTemplate>>((ref) {
  final uid = ref.watch(messagesUidProvider);
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(messagesRepositoryProvider)
      .watchTemplates(uid)
      .map(sortTemplates);
});

final messagingPrefsProvider =
    StreamProvider.autoDispose<MessagingPrefs>((ref) {
  final uid = ref.watch(messagesUidProvider);
  if (uid.isEmpty) return Stream.value(const MessagingPrefs());
  return ref.watch(messagesRepositoryProvider).watchPrefs(uid);
});

/// Professores do aluno (para começar uma conversa).
final myProfessorsProvider =
    FutureProvider.autoDispose<List<MyProfessor>>((ref) {
  if (ref.watch(messagesUidProvider).isEmpty) return Future.value(const []);
  return ref.watch(messagesRepositoryProvider).getMyProfessors();
});
