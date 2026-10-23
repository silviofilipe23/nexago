import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/messages.dart';

/// Falha com a mensagem pronta para a tela.
class MessagesException implements Exception {
  const MessagesException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Mensagens: conversas e mensagens por leitura direta (rules: membros);
/// enviar, abrir e marcar lida por callable (o servidor põe o remetente,
/// revalida o vínculo e limita a frequência)
/// (`functions/src/professor-messages.ts`), modelos e horário do professor
/// gravados direto pelo dono.
abstract class MessagesRepository {
  /// Conversas em que [uid] é membro (sem ordem — a tela ordena).
  Stream<List<Conversation>> watchInbox(String uid);

  Stream<Conversation?> watchConversation(String conversationId);

  /// Da mais antiga para a mais nova.
  Stream<List<ChatMessage>> watchMessages(String conversationId);

  /// `sendConversationMessage`; devolve o id da mensagem.
  Future<String> send(String conversationId, String text);

  Future<String> openProfessorConversation(String athleteId);

  Future<String> openStudentConversation(String professorUid);

  Future<String> openClassConversation(String classId);

  /// Equipe do Centro de treinamento abre a conversa com o aluno
  /// (`openTrainingCenterConversation`): o servidor confere se a pessoa vê o
  /// aluno e se ele tem conta NexaGO.
  Future<String> openCenterConversation(String centerId, String studentId);

  /// Canal com a gestão da arena (D4, `openArenaChannel`): o professor abre o
  /// dele só com [arenaId]; a gestão passa o [professorUid]. Exige vínculo
  /// ativo (o servidor recusa com a mensagem pronta).
  Future<String> openArenaChannel(String arenaId, {String? professorUid});

  Future<void> markRead(String conversationId);

  Future<List<MyProfessor>> getMyProfessors();

  Stream<List<MessageTemplate>> watchTemplates(String uid);

  /// Sem [templateId] cria.
  Future<void> saveTemplate(
    String uid, {
    String? templateId,
    required String title,
    required String body,
    int? uses,
  });

  Future<void> deleteTemplate(String uid, String templateId);

  /// Soma 1 uso (ordem dos chips).
  Future<void> countTemplateUse(String uid, MessageTemplate template);

  Stream<MessagingPrefs> watchPrefs(String uid);

  Future<void> savePrefs(String uid, MessagingPrefs prefs);
}

class FirebaseMessagesRepository implements MessagesRepository {
  FirebaseMessagesRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _conversations =>
      _firestore.collection('conversations');

  CollectionReference<Map<String, dynamic>> _templates(String uid) =>
      _firestore.collection('users').doc(uid).collection('messageTemplates');

  DocumentReference<Map<String, dynamic>> _prefs(String uid) => _firestore
      .collection('users')
      .doc(uid)
      .collection('messagingPrefs')
      .doc('settings');

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      return raw is Map
          ? raw.map((k, v) => MapEntry(k.toString(), v))
          : const <String, Object?>{};
    } on FirebaseFunctionsException catch (e) {
      throw MessagesException(
          callableErrorMessage(e.code, e.message, fallback));
    }
  }

  Future<String> _open(String name, Map<String, Object?> data) async {
    final r = await _call(name, data, 'Não foi possível abrir a conversa.');
    final id = r['conversationId'];
    if (id is! String || id.isEmpty) {
      throw const MessagesException('Não foi possível abrir a conversa.');
    }
    return id;
  }

  // Índice composto `memberIds` (array) + `lastAt` desc vai com o backend.
  @override
  Stream<List<Conversation>> watchInbox(String uid) => _conversations
      .where('memberIds', arrayContains: uid)
      .orderBy('lastAt', descending: true)
      .limit(50)
      .snapshots()
      .map((q) => [
            for (final d in q.docs) Conversation.fromMap(d.id, d.data()),
          ]);

  @override
  Stream<Conversation?> watchConversation(String conversationId) =>
      _conversations.doc(conversationId).snapshots().map((s) {
        final data = s.data();
        return data == null ? null : Conversation.fromMap(s.id, data);
      });

  @override
  Stream<List<ChatMessage>> watchMessages(String conversationId) =>
      _conversations
          .doc(conversationId)
          .collection('messages')
          .orderBy('createdAt')
          .limitToLast(300)
          .snapshots()
          .map((q) => [
                for (final d in q.docs) ChatMessage.fromMap(d.id, d.data()),
              ]);

  @override
  Future<String> send(String conversationId, String text) async {
    final r = await _call(
      'sendConversationMessage',
      {'conversationId': conversationId, 'text': text},
      'Não foi possível enviar. Confira a conexão e tente de novo.',
    );
    final id = r['messageId'];
    return id is String ? id : '';
  }

  @override
  Future<String> openProfessorConversation(String athleteId) =>
      _open('openProfessorConversation', {'athleteId': athleteId});

  @override
  Future<String> openStudentConversation(String professorUid) =>
      _open('openStudentConversation', {'professorUid': professorUid});

  @override
  Future<String> openClassConversation(String classId) =>
      _open('openClassConversation', {'classId': classId});

  @override
  Future<String> openArenaChannel(String arenaId, {String? professorUid}) =>
      _open('openArenaChannel', {
        'arenaId': arenaId,
        if (professorUid != null) 'professorUid': professorUid,
      });

  @override
  Future<String> openCenterConversation(String centerId, String studentId) =>
      _open('openTrainingCenterConversation', {
        'centerId': centerId,
        'studentId': studentId,
      });

  @override
  Future<void> markRead(String conversationId) => _call(
        'markConversationRead',
        {'conversationId': conversationId},
        'Não foi possível marcar como lida.',
      );

  @override
  Future<List<MyProfessor>> getMyProfessors() async {
    final r = await _call(
      'getMyProfessors',
      const {},
      'Não foi possível carregar seus professores.',
    );
    final items = r['items'];
    return [
      if (items is List)
        for (final m in items.whereType<Map>())
          MyProfessor.fromMap(m.map((k, v) => MapEntry(k.toString(), v))),
    ];
  }

  @override
  Stream<List<MessageTemplate>> watchTemplates(String uid) =>
      _templates(uid).snapshots().map((q) => [
            for (final d in q.docs) MessageTemplate.fromMap(d.id, d.data()),
          ]);

  @override
  Future<void> saveTemplate(
    String uid, {
    String? templateId,
    required String title,
    required String body,
    int? uses,
  }) async {
    final ref = templateId == null
        ? _templates(uid).doc()
        : _templates(uid).doc(templateId);
    try {
      await ref.set({
        'title': title.trim(),
        'body': body.trim(),
        'uses': uses ?? 0,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException {
      throw const MessagesException('Não foi possível salvar o modelo.');
    }
  }

  @override
  Future<void> deleteTemplate(String uid, String templateId) async {
    try {
      await _templates(uid).doc(templateId).delete();
    } on FirebaseException {
      throw const MessagesException('Não foi possível apagar o modelo.');
    }
  }

  @override
  Future<void> countTemplateUse(String uid, MessageTemplate template) async {
    try {
      await _templates(uid).doc(template.id).update({
        'uses': FieldValue.increment(1),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException {
      // Contagem é só ordenação: falha não atrapalha a conversa.
    }
  }

  @override
  Stream<MessagingPrefs> watchPrefs(String uid) =>
      _prefs(uid).snapshots().map((s) => MessagingPrefs.fromMap(s.data()));

  @override
  Future<void> savePrefs(String uid, MessagingPrefs prefs) async {
    try {
      await _prefs(uid).set({
        ...prefs.toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } on FirebaseException {
      throw const MessagesException('Não foi possível salvar o horário.');
    }
  }
}

final messagesRepositoryProvider = Provider<MessagesRepository>((ref) {
  return FirebaseMessagesRepository(firestore: ref.watch(firestoreProvider));
});
