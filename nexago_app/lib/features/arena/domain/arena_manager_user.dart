import 'package:cloud_firestore/cloud_firestore.dart';

/// Campos do gestor em `users/{uid}` usados pelo painel da arena.
///
/// [arenaIds] pode ser preenchido pelo backoffice; se vazio, o app usa a
/// query legada `arenas.where(managerUserId == uid)`.
class ArenaManagerUser {
  const ArenaManagerUser({
    required this.uid,
    this.arenaIds = const [],
  });

  final String uid;

  /// Arenas que este usuário pode operar (IDs de documentos em `arenas`).
  final List<String> arenaIds;

  factory ArenaManagerUser.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final raw = data['arenaIds'];
    final ids = raw is List
        ? raw
            .whereType<String>()
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList()
        : <String>[];
    return ArenaManagerUser(uid: doc.id, arenaIds: ids);
  }
}
