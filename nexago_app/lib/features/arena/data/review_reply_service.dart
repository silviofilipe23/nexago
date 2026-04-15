import 'package:cloud_firestore/cloud_firestore.dart';

class ReviewReplyService {
  ReviewReplyService(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _reviews =>
      _firestore.collection('arena_reviews');

  Future<void> replyToReview({
    required String reviewId,
    required String arenaId,
    required String managerUserId,
    required String message,
  }) async {
    final rid = reviewId.trim();
    final aid = arenaId.trim();
    final managerId = managerUserId.trim();
    final msg = message.trim();
    _validateMessage(msg);
    if (rid.isEmpty || aid.isEmpty || managerId.isEmpty) {
      throw Exception('Dados inválidos para responder avaliação.');
    }

    final reviewRef = _reviews.doc(rid);
    await _firestore.runTransaction((tx) async {
      final reviewSnap = await tx.get(reviewRef);
      if (!reviewSnap.exists) {
        throw Exception('Avaliação não encontrada.');
      }
      final data = reviewSnap.data() ?? <String, dynamic>{};
      final reviewArenaId = (data['arenaId'] as String?)?.trim() ?? '';
      if (reviewArenaId != aid) {
        throw Exception('Esta avaliação não pertence à sua arena.');
      }
      if (data['reply'] is Map<String, dynamic>) {
        throw Exception('Esta avaliação já possui resposta.');
      }
      final arenaRef = _firestore.collection('arenas').doc(aid);
      final arenaSnap = await tx.get(arenaRef);
      final manager = (arenaSnap.data()?['managerUserId'] as String?)?.trim() ?? '';
      if (manager != managerId) {
        throw Exception('Apenas o gestor da arena pode responder.');
      }
      tx.update(reviewRef, {
        'reply': {
          'message': msg,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': null,
          'repliedBy': managerId,
        },
      });
    });
  }

  Future<void> updateReviewReply({
    required String reviewId,
    required String arenaId,
    required String managerUserId,
    required String message,
  }) async {
    final rid = reviewId.trim();
    final aid = arenaId.trim();
    final managerId = managerUserId.trim();
    final msg = message.trim();
    _validateMessage(msg);
    if (rid.isEmpty || aid.isEmpty || managerId.isEmpty) {
      throw Exception('Dados inválidos para editar resposta.');
    }

    final reviewRef = _reviews.doc(rid);
    await _firestore.runTransaction((tx) async {
      final reviewSnap = await tx.get(reviewRef);
      if (!reviewSnap.exists) {
        throw Exception('Avaliação não encontrada.');
      }
      final data = reviewSnap.data() ?? <String, dynamic>{};
      final reviewArenaId = (data['arenaId'] as String?)?.trim() ?? '';
      if (reviewArenaId != aid) {
        throw Exception('Esta avaliação não pertence à sua arena.');
      }
      final existingReply = data['reply'];
      if (existingReply is! Map<String, dynamic>) {
        throw Exception('Esta avaliação ainda não possui resposta.');
      }
      final arenaRef = _firestore.collection('arenas').doc(aid);
      final arenaSnap = await tx.get(arenaRef);
      final manager = (arenaSnap.data()?['managerUserId'] as String?)?.trim() ?? '';
      if (manager != managerId) {
        throw Exception('Apenas o gestor da arena pode editar resposta.');
      }
      tx.update(reviewRef, {
        'reply.message': msg,
        'reply.updatedAt': FieldValue.serverTimestamp(),
        'reply.repliedBy': managerId,
      });
    });
  }

  void _validateMessage(String msg) {
    if (msg.isEmpty) {
      throw Exception('A resposta não pode ser vazia.');
    }
    if (msg.length < 5) {
      throw Exception('A resposta deve ter pelo menos 5 caracteres.');
    }
    if (msg.length > 300) {
      throw Exception('A resposta deve ter no máximo 300 caracteres.');
    }
  }
}
