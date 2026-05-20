import 'package:cloud_firestore/cloud_firestore.dart';

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
    this.type,
    this.status = ArenaCourtStatus.active,
    this.dimensionsLabel,
    this.basePricePerHourReais,
  });

  final String id;
  final String name;

  /// Ex.: futevôlei, beach tennis (campo `type` no Firestore).
  final String? type;

  final ArenaCourtStatus status;

  /// Ex.: `8×16 m` (campo `dimensions` no Firestore).
  final String? dimensionsLabel;

  /// Preço base por hora (`basePricePerHourReais` ou `basePriceReais`).
  final double? basePricePerHourReais;

  bool get isMaintenance => status == ArenaCourtStatus.maintenance;

  factory ArenaCourt.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    final raw = (data['name'] as String?)?.trim();
    final name = (raw == null || raw.isEmpty) ? 'Quadra ${doc.id}' : raw;
    final typeRaw = (data['type'] as String?)?.trim();
    final type = (typeRaw == null || typeRaw.isEmpty) ? null : typeRaw;

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
      type: type,
      status: status,
      dimensionsLabel: dimensionsLabel,
      basePricePerHourReais: price,
    );
  }
}
