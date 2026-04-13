import 'package:cloud_firestore/cloud_firestore.dart';

/// Quadra em `arenas/{arenaId}/courts/{courtId}`.
class ArenaCourt {
  const ArenaCourt({
    required this.id,
    required this.name,
    this.type,
  });

  final String id;
  final String name;

  /// Ex.: futevôlei, beach tennis (campo `type` no Firestore).
  final String? type;

  factory ArenaCourt.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    final raw = (data['name'] as String?)?.trim();
    final name = (raw == null || raw.isEmpty) ? 'Quadra ${doc.id}' : raw;
    final typeRaw = (data['type'] as String?)?.trim();
    final type = (typeRaw == null || typeRaw.isEmpty) ? null : typeRaw;
    return ArenaCourt(id: doc.id, name: name, type: type);
  }
}
