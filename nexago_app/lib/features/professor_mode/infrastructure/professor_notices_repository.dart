import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_notices.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Resultado de `sendProfessorNotice`.
typedef ProfessorNoticeSent = ({
  String noticeId,
  ProfessorNoticeStatus status,
  int recipientCount,
});

/// Comunicados: leitura direta (as rules liberam ao professor dono e ao
/// aluno destinatário) e escrita por callable. Falhas como
/// [ProfessorStudentsException], com a mensagem pronta.
abstract class ProfessorNoticesRepository {
  /// Do professor (sem ordem — a tela ordena).
  Stream<List<ProfessorNotice>> watchMyNotices(String uid);

  /// Leitura e respostas de um comunicado (professor).
  Stream<List<ProfessorNoticeRecipient>> watchRecipients(String noticeId);

  Future<String> save(ProfessorNoticeInput input);

  Future<ProfessorNoticeSent> send(ProfessorNoticeInput input);

  Future<void> delete(String noticeId);

  /// Devolve quantos foram lembrados.
  Future<int> remind(String noticeId);

  Future<int> previewAudience(ProfessorNoticeAudience audience);

  // ── lado do aluno ──

  /// `null` = não existe ou não é para quem está logado.
  Stream<ProfessorNotice?> watchNotice(String noticeId);

  Stream<ProfessorNoticeRecipient?> watchMyReply(String noticeId, String uid);

  /// Sem [answer] só marca lido. Devolve a resposta valendo.
  Future<String?> respond(String noticeId, {String? answer});
}

class FirebaseProfessorNoticesRepository implements ProfessorNoticesRepository {
  FirebaseProfessorNoticesRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _notices =>
      _firestore.collection('professorNotices');

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
      throw ProfessorStudentsException(
        callableErrorMessage(e.code, e.message, fallback),
      );
    }
  }

  // A rule só deixa ler filtrando pelo dono; sem orderBy (sem índice).
  @override
  Stream<List<ProfessorNotice>> watchMyNotices(String uid) =>
      _notices.where('professorUid', isEqualTo: uid).snapshots().map((q) => [
            for (final d in q.docs) ProfessorNotice.fromMap(d.id, d.data()),
          ]);

  @override
  Stream<List<ProfessorNoticeRecipient>> watchRecipients(String noticeId) =>
      _notices.doc(noticeId).collection('recipients').snapshots().map((q) => [
            for (final d in q.docs)
              ProfessorNoticeRecipient.fromMap(d.id, d.data()),
          ]);

  @override
  Future<String> save(ProfessorNoticeInput input) async {
    final r = await _call(
      'saveProfessorNotice',
      input.toPayload(),
      'Não foi possível salvar o rascunho.',
    );
    final id = r['noticeId'];
    return id is String ? id : input.noticeId ?? '';
  }

  @override
  Future<ProfessorNoticeSent> send(ProfessorNoticeInput input) async {
    final r = await _call(
      'sendProfessorNotice',
      input.toPayload(),
      'Não foi possível enviar o comunicado.',
    );
    final count = r['recipientCount'];
    return (
      noticeId: r['noticeId'] is String ? r['noticeId']! as String : '',
      status: ProfessorNoticeStatus.parse(r['status']),
      recipientCount: count is num ? count.toInt() : 0,
    );
  }

  @override
  Future<void> delete(String noticeId) => _call(
        'deleteProfessorNotice',
        {'noticeId': noticeId},
        'Não foi possível apagar o comunicado.',
      );

  @override
  Future<int> remind(String noticeId) async {
    final r = await _call(
      'remindProfessorNotice',
      {'noticeId': noticeId},
      'Não foi possível enviar o lembrete.',
    );
    final n = r['reminded'];
    return n is num ? n.toInt() : 0;
  }

  @override
  Future<int> previewAudience(ProfessorNoticeAudience audience) async {
    final r = await _call(
      'previewProfessorNoticeAudience',
      {'audience': audience.toMap()},
      'Não foi possível contar os alunos.',
    );
    final n = r['recipientCount'];
    return n is num ? n.toInt() : 0;
  }

  @override
  Stream<ProfessorNotice?> watchNotice(String noticeId) =>
      _notices.doc(noticeId).snapshots().map((s) {
        final data = s.data();
        return data == null ? null : ProfessorNotice.fromMap(s.id, data);
      });

  @override
  Stream<ProfessorNoticeRecipient?> watchMyReply(String noticeId, String uid) =>
      _notices
          .doc(noticeId)
          .collection('recipients')
          .doc(uid)
          .snapshots()
          .map((s) {
        final data = s.data();
        return data == null
            ? null
            : ProfessorNoticeRecipient.fromMap(s.id, data);
      });

  @override
  Future<String?> respond(String noticeId, {String? answer}) async {
    final r = await _call(
      'respondProfessorNotice',
      {'noticeId': noticeId, if (answer != null) 'answer': answer},
      'Não foi possível registrar sua resposta.',
    );
    final a = r['answer'];
    return a is String && a.isNotEmpty ? a : null;
  }
}

final professorNoticesRepositoryProvider =
    Provider<ProfessorNoticesRepository>((ref) {
  return FirebaseProfessorNoticesRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
