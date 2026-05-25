import 'package:cloud_firestore/cloud_firestore.dart';

import 'virtual_slot_generator.dart';

/// Status operacional da quadra no painel.
enum ArenaCourtStatus {
  active,
  maintenance,
}

/// Quadra em `arenas/{arenaId}/courts/{courtId}`.
class ArenaCourt {
  const ArenaCourt({
    required this.id,
    required this.name,
    this.sportTypes = const [],
    this.status = ArenaCourtStatus.active,
    this.dimensionsLabel,
    this.basePricePerHourReais,
    this.slotDurationMinutes = 60,
  });

  final String id;
  final String name;

  /// Esportes praticados na quadra (`types` no Firestore; legado: `type` string).
  final List<String> sportTypes;

  /// Primeiro esporte — compatibilidade com código que lia `type`.
  String? get type => sportTypes.isEmpty ? null : sportTypes.first;

  String get sportTypesLabel =>
      sportTypes.isEmpty ? '—' : sportTypes.join(' · ');

  final ArenaCourtStatus status;

  /// Ex.: `8×16 m` (campo `dimensions` no Firestore).
  final String? dimensionsLabel;

  /// Preço base por hora (`basePricePerHourReais` ou `basePriceReais`).
  final double? basePricePerHourReais;

  /// Duração de cada slot na grade (`slotDurationMinutes` no Firestore).
  final int slotDurationMinutes;

  bool get isMaintenance => status == ArenaCourtStatus.maintenance;

  static List<String> sportTypesFromFirestore(Map<String, dynamic> data) {
    final out = <String>[];
    final rawTypes = data['types'] ?? data['sportTypes'];
    if (rawTypes is List) {
      for (final e in rawTypes) {
        if (e is String && e.trim().isNotEmpty) {
          final s = e.trim();
          if (!out.any((x) => x.toLowerCase() == s.toLowerCase())) out.add(s);
        }
      }
    }
    if (out.isNotEmpty) return out;

    final legacy = (data['type'] as String?)?.trim();
    if (legacy != null && legacy.isNotEmpty) return [legacy];
    return const [];
  }

  factory ArenaCourt.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    final raw = (data['name'] as String?)?.trim();
    final name = (raw == null || raw.isEmpty) ? 'Quadra ${doc.id}' : raw;
    final sportTypes = sportTypesFromFirestore(data);

    final statusRaw = (data['status'] as String?)?.trim().toLowerCase();
    final maintenanceFlag = data['maintenance'] == true;
    final status = maintenanceFlag || statusRaw == 'maintenance'
        ? ArenaCourtStatus.maintenance
        : ArenaCourtStatus.active;

    final dimensions = (data['dimensions'] as String?)?.trim();
    final dimensionsLabel =
        dimensions != null && dimensions.isNotEmpty ? dimensions : null;

    final price = (data['basePricePerHourReais'] as num?)?.toDouble() ??
        (data['basePriceReais'] as num?)?.toDouble();

    return ArenaCourt(
      id: doc.id,
      name: name,
      sportTypes: sportTypes,
      status: status,
      dimensionsLabel: dimensionsLabel,
      basePricePerHourReais: price,
      slotDurationMinutes: VirtualSlotGenerator.readSlotDurationMinutes(data),
    );
  }
}
