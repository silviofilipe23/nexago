import 'package:cloud_firestore/cloud_firestore.dart';

import '../../arenas/data/arena_search_metadata_service.dart';
import '../../arenas/domain/arena_search_metadata.dart';

class CourtServiceException implements Exception {
  CourtServiceException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// CRUD de quadras em `arenas/{arenaId}/courts/{courtId}`.
class CourtService {
  CourtService(this._firestore, [ArenaSearchMetadataService? metadataSync])
      : _metadataSync = metadataSync ?? ArenaSearchMetadataService(_firestore);

  final FirebaseFirestore _firestore;
  final ArenaSearchMetadataService _metadataSync;

  static const Set<int> allowedSlotDurations = {30, 60, 120};

  /// Lê duração + agenda da primeira quadra (template para a tela de ajustes).
  Future<({int slotDuration, Map<String, dynamic> schedule})?> loadScheduleTemplate(
    String arenaId,
  ) async {
    final a = arenaId.trim();
    if (a.isEmpty) return null;
    final snap = await _firestore
        .collection('arenas')
        .doc(a)
        .collection('courts')
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    final d = snap.docs.first.data();
    final rawDur = (d['slotDurationMinutes'] as num?)?.toInt() ?? 60;
    final slotDuration = allowedSlotDurations.contains(rawDur) ? rawDur : 60;
    final raw = d['availabilitySchedule'];
    final schedule = <String, dynamic>{};
    if (raw is Map) {
      for (final e in raw.entries) {
        schedule['${e.key}'] = e.value;
      }
    }
    return (slotDuration: slotDuration, schedule: schedule);
  }

  /// Aplica `slotDurationMinutes` e `availabilitySchedule` em **todas** as quadras
  /// (base para slots virtuais na agenda).
  Future<void> generateSlots({
    required String arenaId,
    required int slotDurationMinutes,
    required Map<String, dynamic> availabilitySchedule,
  }) async {
    final a = arenaId.trim();
    if (a.isEmpty) {
      throw CourtServiceException('Arena inválida.');
    }
    if (!allowedSlotDurations.contains(slotDurationMinutes)) {
      throw CourtServiceException('Escolha duração de 30 min, 1 h ou 2 h.');
    }
    final courts = await _firestore
        .collection('arenas')
        .doc(a)
        .collection('courts')
        .get();
    if (courts.docs.isEmpty) {
      throw CourtServiceException(
        'Cadastre ao menos uma quadra antes de gerar horários.',
      );
    }
    final batch = _firestore.batch();
    for (final doc in courts.docs) {
      batch.update(
        doc.reference,
        <String, dynamic>{
          'slotDurationMinutes': slotDurationMinutes,
          'availabilitySchedule': availabilitySchedule,
          'scheduleUpdatedAt': FieldValue.serverTimestamp(),
        },
      );
    }
    await batch.commit();
  }

  static List<String> _normalizeSportTypes(List<String> sportTypes) {
    final unique = ArenaSearchMetadata.uniqueLabels(sportTypes);
    if (unique.isEmpty) {
      throw CourtServiceException('Selecione ao menos um esporte na quadra.');
    }
    return unique;
  }

  /// Cria uma nova quadra (ID gerado pelo Firestore).
  Future<void> addCourt({
    required String arenaId,
    required String name,
    required List<String> sportTypes,
    double? basePricePerHourReais,
  }) async {
    final a = arenaId.trim();
    final n = name.trim();
    final types = _normalizeSportTypes(sportTypes);
    if (a.isEmpty) {
      throw CourtServiceException('Arena inválida.');
    }
    if (n.isEmpty) {
      throw CourtServiceException('Informe o nome da quadra.');
    }

    final data = <String, dynamic>{
      'name': n,
      'types': types,
      'type': types.first,
      'status': 'active',
      'createdAt': FieldValue.serverTimestamp(),
    };
    if (basePricePerHourReais != null && basePricePerHourReais > 0) {
      data['basePricePerHourReais'] = basePricePerHourReais;
      data['basePriceReais'] = basePricePerHourReais;
    }
    await _firestore.collection('arenas').doc(a).collection('courts').add(data);
    await _metadataSync.syncFromCourts(arenaId: a);
  }

  /// Atualiza nome e esportes da quadra.
  Future<void> updateCourt({
    required String arenaId,
    required String courtId,
    required String name,
    required List<String> sportTypes,
    double? basePricePerHourReais,
  }) async {
    final a = arenaId.trim();
    final c = courtId.trim();
    final n = name.trim();
    final types = _normalizeSportTypes(sportTypes);
    if (a.isEmpty || c.isEmpty) {
      throw CourtServiceException('Dados inválidos.');
    }
    if (n.isEmpty) {
      throw CourtServiceException('Informe o nome da quadra.');
    }

    final data = <String, dynamic>{
      'name': n,
      'types': types,
      'type': types.first,
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (basePricePerHourReais != null && basePricePerHourReais > 0) {
      data['basePricePerHourReais'] = basePricePerHourReais;
      data['basePriceReais'] = basePricePerHourReais;
    }
    await _firestore
        .collection('arenas')
        .doc(a)
        .collection('courts')
        .doc(c)
        .update(data);
    await _metadataSync.syncFromCourts(arenaId: a);
  }

  /// Remove a quadra.
  Future<void> deleteCourt({
    required String arenaId,
    required String courtId,
  }) async {
    final a = arenaId.trim();
    final c = courtId.trim();
    if (a.isEmpty || c.isEmpty) {
      throw CourtServiceException('Dados inválidos.');
    }

    await _firestore
        .collection('arenas')
        .doc(a)
        .collection('courts')
        .doc(c)
        .delete();
    await _metadataSync.syncFromCourts(arenaId: a);
  }
}
