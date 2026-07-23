import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../arenas/domain/arena_club_session.dart';
import '../domain/arena_club.dart';

class ArenaClubAdminException implements Exception {
  ArenaClubAdminException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Resultado de `upsertArenaClub` / `setArenaClubStatus` (datas materializadas).
class ArenaClubUpsertResult {
  const ArenaClubUpsertResult({
    required this.clubId,
    required this.createdDates,
    required this.skippedDates,
  });

  final String clubId;
  final List<String> createdDates;
  final List<String> skippedDates;
}

/// Resultado de `cancelArenaClubSession` (estorno em massa automático).
class ArenaClubCancelSessionResult {
  const ArenaClubCancelSessionResult({
    required this.sessionId,
    required this.refunded,
    required this.refundFailed,
    required this.canceledPending,
  });

  final String sessionId;
  final int refunded;
  final int refundFailed;
  final int canceledPending;
}

/// Clubinho (lado gestor): leitura direta de `arenaClubs` /
/// `arenaClubSessions` e escrita via callables (`upsertArenaClub`,
/// `setArenaClubStatus`, `createArenaClubSession`, `cancelArenaClubSession`).
class ArenaClubService {
  ArenaClubService(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const String clubsCollection = 'arenaClubs';
  static const String sessionsCollection = 'arenaClubSessions';
  static const String participantsCollection = 'clubParticipants';

  /// Clubinhos da arena (ativos primeiro, arquivados por último).
  Stream<List<ArenaClub>> watchClubs(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(clubsCollection)
        .where('arenaId', isEqualTo: id)
        .snapshots()
        .map((snap) {
      final list = snap.docs.map(ArenaClub.fromFirestore).toList();
      list.sort((a, b) {
        final rank = _statusRank(a.status).compareTo(_statusRank(b.status));
        if (rank != 0) return rank;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
      return list;
    });
  }

  /// Um clubinho em tempo real.
  Stream<ArenaClub?> watchClub(String clubId) {
    final id = clubId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _firestore.collection(clubsCollection).doc(id).snapshots().map(
          (doc) => doc.exists ? ArenaClub.fromFirestore(doc) : null,
        );
  }

  /// Próximas sessões do clubinho a partir de hoje (índice `clubId,date`).
  Stream<List<ArenaClubSession>> watchClubSessions(String clubId) {
    final id = clubId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(sessionsCollection)
        .where('clubId', isEqualTo: id)
        .where('date', isGreaterThanOrEqualTo: _todayKey())
        .orderBy('date')
        .snapshots()
        .map(
          (snap) => snap.docs.map(ArenaClubSession.fromFirestore).toList(),
        );
  }

  /// Participantes de uma sessão (ordem de entrada).
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

  /// Cria ([clubId] nulo) ou edita um clubinho. Edição só vale para sessões
  /// futuras ainda não geradas.
  Future<ArenaClubUpsertResult> upsertClub({
    String? clubId,
    required String arenaId,
    required String name,
    String? description,
    int? weekday,
    required String startTime,
    required String endTime,
    required List<String> courtIds,
    required int capacity,
    required double priceReais,
    required int cancelWindowHours,
    bool allowOnsitePayment = true,
    String? startDate,
    String? endDate,
  }) async {
    try {
      final result = await _functions.httpsCallable('upsertArenaClub').call({
        if (clubId != null && clubId.trim().isNotEmpty)
          'clubId': clubId.trim(),
        'arenaId': arenaId,
        'name': name,
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
        'weekday': weekday,
        'startTime': startTime,
        'endTime': endTime,
        'courtIds': courtIds,
        'capacity': capacity,
        'priceReais': priceReais,
        'cancelWindowHours': cancelWindowHours,
        'allowOnsitePayment': allowOnsitePayment,
        if (startDate != null) 'startDate': startDate,
        if (endDate != null) 'endDate': endDate,
      });
      return _parseUpsertResult(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClubAdminException(_mapMessage(e), code: e.code);
    }
  }

  /// Ativa/pausa/arquiva. Arquivar com sessões futuras com gente inscrita
  /// gera erro pedindo para cancelar as sessões antes.
  Future<ArenaClubUpsertResult> setClubStatus({
    required String clubId,
    required String status,
  }) async {
    try {
      final result = await _functions.httpsCallable('setArenaClubStatus').call({
        'clubId': clubId,
        'status': status,
      });
      return _parseUpsertResult(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClubAdminException(_mapMessage(e), code: e.code);
    }
  }

  /// Sessão avulsa em [date] (`YYYY-MM-DD`). Retorna quadras puladas por
  /// conflito de agenda.
  Future<({String sessionId, List<String> skippedCourtIds})>
      createSession({
    required String clubId,
    required String date,
  }) async {
    try {
      final result =
          await _functions.httpsCallable('createArenaClubSession').call({
        'clubId': clubId,
        'date': date,
      });
      final data = result.data;
      if (data is! Map) {
        throw ArenaClubAdminException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      final sessionId = (map['sessionId'] as String?)?.trim();
      if (sessionId == null || sessionId.isEmpty) {
        throw ArenaClubAdminException('Resposta inválida do servidor.');
      }
      return (
        sessionId: sessionId,
        skippedCourtIds: _stringList(map['skippedCourtIds']),
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClubAdminException(_mapMessage(e), code: e.code);
    }
  }

  /// Cancela a sessão com estorno em massa automático dos confirmados.
  Future<ArenaClubCancelSessionResult> cancelSession({
    required String sessionId,
    String? reason,
  }) async {
    try {
      final result =
          await _functions.httpsCallable('cancelArenaClubSession').call({
        'sessionId': sessionId,
        if (reason != null && reason.trim().isNotEmpty)
          'reason': reason.trim(),
      });
      final data = result.data;
      if (data is! Map) {
        throw ArenaClubAdminException('Resposta inválida do servidor.');
      }
      final map = Map<String, dynamic>.from(data);
      return ArenaClubCancelSessionResult(
        sessionId: (map['sessionId'] as String?)?.trim() ?? sessionId,
        refunded: (map['refunded'] as num?)?.toInt() ?? 0,
        refundFailed: (map['refundFailed'] as num?)?.toInt() ?? 0,
        canceledPending: (map['canceledPending'] as num?)?.toInt() ?? 0,
      );
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClubAdminException(_mapMessage(e), code: e.code);
    }
  }

  static ArenaClubUpsertResult _parseUpsertResult(dynamic data) {
    if (data is! Map) {
      throw ArenaClubAdminException('Resposta inválida do servidor.');
    }
    final map = Map<String, dynamic>.from(data);
    final clubId = (map['clubId'] as String?)?.trim();
    if (clubId == null || clubId.isEmpty) {
      throw ArenaClubAdminException('Resposta inválida do servidor.');
    }
    return ArenaClubUpsertResult(
      clubId: clubId,
      createdDates: _stringList(map['createdDates']),
      skippedDates: _stringList(map['skippedDates']),
    );
  }

  static int _statusRank(String status) => switch (status) {
        'active' => 0,
        'paused' => 1,
        'archived' => 2,
        _ => 3,
      };

  static List<String> _stringList(dynamic v) {
    if (v is! List) return const [];
    return [
      for (final item in v)
        if (item is String && item.trim().isNotEmpty) item.trim(),
    ];
  }

  static String _todayKey() {
    final now = DateTime.now();
    final y = now.year.toString().padLeft(4, '0');
    final m = now.month.toString().padLeft(2, '0');
    final d = now.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  /// As callables já devolvem mensagens PT; prioriza o texto do servidor.
  static String _mapMessage(FirebaseFunctionsException e) {
    final message = e.message?.trim();
    if (message != null && message.isNotEmpty) return message;
    switch (e.code) {
      case 'unauthenticated':
        return 'Faça login para continuar.';
      case 'permission-denied':
        return 'Sem permissão para gerenciar esta arena.';
      case 'already-exists':
        return 'Já existe uma sessão deste clubinho nessa data.';
      case 'internal':
      case 'unknown':
      case 'unavailable':
        return 'Erro no servidor. Tente novamente em instantes.';
      default:
        return 'Não foi possível concluir a operação. Tente novamente.';
    }
  }
}
