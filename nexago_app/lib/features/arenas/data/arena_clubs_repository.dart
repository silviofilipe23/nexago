import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../domain/arena_club_session.dart';

class ArenaClubException implements Exception {
  ArenaClubException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Resposta da callable `joinArenaClubSession` (cobrança PIX da vaga).
class ClubJoinPixResult {
  const ClubJoinPixResult({
    required this.sessionId,
    required this.paymentId,
    required this.qrCode,
    required this.qrCodeBase64,
    required this.pixCopyPaste,
    required this.expiresAt,
    required this.amountReais,
  });

  final String sessionId;
  final String paymentId;
  final String qrCode;
  final String qrCodeBase64;
  final String pixCopyPaste;
  final DateTime expiresAt;
  final double amountReais;
}

/// Resposta da callable `leaveArenaClubSession`.
class ClubLeaveResult {
  const ClubLeaveResult({
    required this.sessionId,
    required this.status,
    required this.refunded,
  });

  final String sessionId;
  final String status;
  final bool refunded;
}

/// Clubinho (lado atleta): leitura direta de `arenaClubSessions` /
/// `clubParticipants` e escrita via callables `joinArenaClubSession` /
/// `leaveArenaClubSession`.
class ArenaClubsRepository {
  ArenaClubsRepository(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String sessionsCollection = 'arenaClubSessions';
  static const String participantsCollection = 'clubParticipants';

  /// Prazo PIX de fallback (alinhado ao das reservas de arena).
  static const Duration pixExpiryFallback = Duration(minutes: 5);

  /// Próximas sessões abertas da arena (índice `arenaId,status,date`).
  Stream<List<ArenaClubSession>> watchUpcomingClubSessions(
    String arenaId, {
    int limit = 12,
  }) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _firestore
        .collection(sessionsCollection)
        .where('arenaId', isEqualTo: id)
        .where('status', isEqualTo: 'scheduled')
        .where('date', isGreaterThanOrEqualTo: _todayKey())
        .orderBy('date')
        .limit(limit)
        .snapshots()
        .map(
          (snap) => snap.docs.map(ArenaClubSession.fromFirestore).toList(),
        );
  }

  /// Uma sessão em tempo real (`null` se não existir).
  Stream<ArenaClubSession?> watchClubSession(String sessionId) {
    final id = sessionId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore.collection(sessionsCollection).doc(id).snapshots().map(
          (doc) => doc.exists ? ArenaClubSession.fromFirestore(doc) : null,
        );
  }

  /// Lista de participantes da sessão (ordem de entrada).
  Stream<List<ClubParticipant>> watchClubParticipants(String sessionId) {
    final id = sessionId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(sessionsCollection)
        .doc(id)
        .collection(participantsCollection)
        .orderBy('joinedAt')
        .snapshots()
        .map((snap) => snap.docs.map(ClubParticipant.fromFirestore).toList());
  }

  /// Minha inscrição na sessão (`null` se nunca entrei).
  Stream<ClubParticipant?> watchMyParticipant(String sessionId, String uid) {
    final id = sessionId.trim();
    final user = uid.trim();
    if (id.isEmpty || user.isEmpty) return Stream.value(null);
    return _firestore
        .collection(sessionsCollection)
        .doc(id)
        .collection(participantsCollection)
        .doc(user)
        .snapshots()
        .map((doc) => doc.exists ? ClubParticipant.fromFirestore(doc) : null);
  }

  /// Minhas participações a partir de ontem (CG `clubParticipants`, índice
  /// `athleteId,startAt`).
  Stream<List<ClubParticipant>> watchMyClubParticipations(String uid) {
    final user = uid.trim();
    if (user.isEmpty) return Stream.value(const []);
    final from = DateTime.now().subtract(const Duration(days: 1));
    return _firestore
        .collectionGroup(participantsCollection)
        .where('athleteId', isEqualTo: user)
        .where('startAt', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
        .orderBy('startAt')
        .snapshots()
        .map((snap) => snap.docs.map(ClubParticipant.fromFirestore).toList());
  }

  /// Entra na lista: segura a vaga (~5 min) e gera a cobrança PIX.
  ///
  /// A confirmação chega pelo webhook — escute [watchMyParticipant] até o
  /// status virar `confirmed`.
  Future<ClubJoinPixResult> joinSession({
    required String sessionId,
    String? cpfCnpj,
  }) async {
    final id = sessionId.trim();
    if (id.isEmpty) {
      throw ArenaClubException('Sessão inválida.');
    }
    try {
      final payload = <String, dynamic>{'sessionId': id};
      final cpf = cpfCnpj?.replaceAll(RegExp(r'\D'), '') ?? '';
      if (cpf.length == 11 || cpf.length == 14) {
        payload['cpfCnpj'] = cpf;
      }
      final raw =
          await _functions.httpsCallable('joinArenaClubSession').call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw ArenaClubException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final paymentId = (map['paymentId'] as String?)?.trim();
      final qrCode = (map['qrCode'] as String?)?.trim();
      final amount = (map['amountReais'] as num?)?.toDouble();
      if (paymentId == null ||
          paymentId.isEmpty ||
          qrCode == null ||
          qrCode.isEmpty ||
          amount == null ||
          amount <= 0) {
        throw ArenaClubException('Resposta inválida do servidor de pagamento.');
      }
      final expiresAtRaw = map['expiresAt'] as String?;
      final expiresAt = expiresAtRaw != null
          ? DateTime.tryParse(expiresAtRaw)?.toLocal() ??
              DateTime.now().add(pixExpiryFallback)
          : DateTime.now().add(pixExpiryFallback);
      return ClubJoinPixResult(
        sessionId: (map['sessionId'] as String?)?.trim() ?? id,
        paymentId: paymentId,
        qrCode: qrCode,
        qrCodeBase64: (map['qrCodeBase64'] as String?) ?? '',
        pixCopyPaste: (map['pixCopyPaste'] as String?)?.trim() ?? qrCode,
        expiresAt: expiresAt,
        amountReais: amount,
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClubException(_mapMessage(e), code: e.code);
    } catch (e) {
      if (e is ArenaClubException) rethrow;
      throw ArenaClubException('Não foi possível entrar na lista: $e');
    }
  }

  /// Sai da lista. Pendente → cancela o PIX; confirmado dentro do prazo →
  /// estorno automático; fora do prazo → erro com a mensagem do servidor.
  Future<ClubLeaveResult> leaveSession({required String sessionId}) async {
    final id = sessionId.trim();
    if (id.isEmpty) {
      throw ArenaClubException('Sessão inválida.');
    }
    try {
      final raw = await _functions
          .httpsCallable('leaveArenaClubSession')
          .call(<String, dynamic>{'sessionId': id});
      final data = raw.data;
      if (data is! Map) {
        throw ArenaClubException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      return ClubLeaveResult(
        sessionId: (map['sessionId'] as String?)?.trim() ?? id,
        status: (map['status'] as String?)?.trim() ?? '',
        refunded: map['refunded'] == true,
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClubException(_mapMessage(e), code: e.code);
    } catch (e) {
      if (e is ArenaClubException) rethrow;
      throw ArenaClubException('Não foi possível sair da lista: $e');
    }
  }

  static String _todayKey() {
    final now = DateTime.now();
    final y = now.year.toString().padLeft(4, '0');
    final m = now.month.toString().padLeft(2, '0');
    final d = now.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  /// As callables do Clubinho já devolvem mensagens em PT — prioriza o texto
  /// do servidor e cai em mensagens genéricas por código.
  static String _mapMessage(FirebaseFunctionsException e) {
    final message = e.message?.trim();
    if (message != null && message.isNotEmpty) return message;
    switch (e.code) {
      case 'unauthenticated':
        return 'Faça login para continuar.';
      case 'not-found':
        return 'Sessão do clubinho não encontrada.';
      case 'resource-exhausted':
        return 'A lista desta sessão está cheia.';
      case 'internal':
      case 'unknown':
      case 'unavailable':
        return 'Erro no servidor. Tente novamente em instantes.';
      default:
        return 'Não foi possível concluir a operação. Tente novamente.';
    }
  }
}
