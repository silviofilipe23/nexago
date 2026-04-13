import 'package:cloud_firestore/cloud_firestore.dart';

class CourtServiceException implements Exception {
  CourtServiceException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// CRUD de quadras em `arenas/{arenaId}/courts/{courtId}`.
class CourtService {
  CourtService(this._firestore);

  final FirebaseFirestore _firestore;

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

  /// Cria uma nova quadra (ID gerado pelo Firestore).
  Future<void> addCourt({
    required String arenaId,
    required String name,
    required String type,
  }) async {
    final a = arenaId.trim();
    final n = name.trim();
    final t = type.trim();
    if (a.isEmpty) {
      throw CourtServiceException('Arena inválida.');
    }
    if (n.isEmpty) {
      throw CourtServiceException('Informe o nome da quadra.');
    }
    if (t.isEmpty) {
      throw CourtServiceException('Selecione o tipo da quadra.');
    }

    await _firestore.collection('arenas').doc(a).collection('courts').add(<String, dynamic>{
      'name': n,
      'type': t,
      'createdAt': FieldValue.serverTimestamp(),
    });
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

    await _firestore.collection('arenas').doc(a).collection('courts').doc(c).delete();
  }
}
