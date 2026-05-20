import 'package:cloud_firestore/cloud_firestore.dart';

import '../../arenas/data/slots_repository.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arena_slot_block_reason.dart';

class SlotServiceException implements Exception {
  SlotServiceException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Agrega slots do dia por quadra e operações do gestor em `arenaSlots`.
///
/// A leitura da agenda usa [SlotsRepository.watchArenaDaySlotsMerged] com
/// `.snapshots()` em `arenaSlots` e em `arenas/{id}/courts` — a UI atualiza em tempo real.
class SlotService {
  SlotService(
    this._slotsRepository,
    this._firestore,
  );

  final SlotsRepository _slotsRepository;
  final FirebaseFirestore _firestore;

  static const String _slotsCollection = 'arenaSlots';

  /// Todos os horários do dia (todas as quadras), ordenados por horário e quadra.
  /// Atualiza automaticamente quando slots ou quadras mudam no Firestore.
  Stream<List<ArenaSlot>> watchArenaDaySlots({
    required String arenaId,
    required DateTime date,
  }) {
    return _slotsRepository.watchArenaDaySlotsMerged(
      arenaId: arenaId,
      date: date,
    );
  }

  /// Bloqueia um horário já persistido em `arenaSlots/{slotId}` (`status: blocked`).
  ///
  /// A UI que usa [watchArenaDaySlots] atualiza em tempo real (snapshots).
  /// Slots **virtuais** (id gerado localmente, prefixo `v_`) não têm documento — use [blockVirtualSlot].
  Future<void> blockSlot(
    String slotId, {
    ArenaSlotBlockReason? blockReason,
    String? blockNote,
  }) async {
    final id = slotId.trim();
    if (id.isEmpty) {
      throw SlotServiceException('slotId inválido.');
    }
    if (id.startsWith('v_')) {
      throw SlotServiceException(
        'Este horário ainda não existe no Firestore. Mantenha pressionado e bloqueie a partir do slot completo (slot virtual).',
      );
    }

    final ref = _firestore.collection(_slotsCollection).doc(id);
    final snap = await ref.get();
    if (!snap.exists) {
      throw SlotServiceException('Horário não encontrado.');
    }

    final data = snap.data()!;
    final status = (data['status'] as String?)?.trim().toLowerCase() ?? '';
    if (_statusIsBooked(status)) {
      throw SlotServiceException('Este horário está reservado e não pode ser bloqueado.');
    }
    if (_statusIsBlocked(status)) {
      return;
    }

    await ref.update(_blockPayload(blockReason: blockReason, blockNote: blockNote));
  }

  /// Cria documento em `arenaSlots` para bloquear um slot **virtual** (sem doc no Firestore).
  Future<void> blockVirtualSlot(
    ArenaSlot slot, {
    ArenaSlotBlockReason? blockReason,
    String? blockNote,
  }) async {
    if (!slot.isVirtual) {
      throw SlotServiceException('Use blockSlot(slotId) para horários já salvos.');
    }
    if (slot.isBooked) {
      throw SlotServiceException('Este horário está reservado e não pode ser bloqueado.');
    }
    if (slot.isBlocked) {
      return;
    }

    await _firestore.collection(_slotsCollection).add(<String, dynamic>{
      'arenaId': slot.arenaId,
      'courtId': slot.courtId,
      'date': Timestamp.fromDate(slot.date),
      'startTime': slot.startTime,
      'endTime': slot.endTime,
      ..._blockPayload(blockReason: blockReason, blockNote: blockNote),
    });
  }

  static Map<String, dynamic> _blockPayload({
    ArenaSlotBlockReason? blockReason,
    String? blockNote,
  }) {
    final payload = <String, dynamic>{
      'status': 'blocked',
      'blockedAt': FieldValue.serverTimestamp(),
    };
    if (blockReason != null) {
      payload['blockReason'] = blockReason.firestoreValue;
    }
    final note = blockNote?.trim();
    if (note != null && note.isNotEmpty) {
      payload['blockNote'] = note;
    }
    return payload;
  }

  /// Libera um horário bloqueado em `arenaSlots/{slotId}` (`status: available`).
  Future<void> unblockSlot(String slotId) async {
    final id = slotId.trim();
    if (id.isEmpty) {
      throw SlotServiceException('slotId inválido.');
    }
    if (id.startsWith('v_')) {
      throw SlotServiceException(
        'Este horário ainda não existe no Firestore. Não é possível desbloquear.',
      );
    }

    final ref = _firestore.collection(_slotsCollection).doc(id);
    final snap = await ref.get();
    if (!snap.exists) {
      throw SlotServiceException('Horário não encontrado.');
    }

    final data = snap.data()!;
    final status = (data['status'] as String?)?.trim().toLowerCase() ?? '';
    if (_statusIsBooked(status)) {
      throw SlotServiceException('Este horário está reservado; não pode ser desbloqueado.');
    }
    if (!_statusIsBlocked(status)) {
      return;
    }

    await ref.update(<String, dynamic>{
      'status': 'available',
      'blockedAt': FieldValue.delete(),
      'blockReason': FieldValue.delete(),
      'blockNote': FieldValue.delete(),
    });
  }

  static bool _statusIsBooked(String status) {
    switch (status) {
      case 'booked':
      case 'occupied':
      case 'busy':
      case 'reservado':
      case 'ocupado':
        return true;
      default:
        return false;
    }
  }

  static bool _statusIsBlocked(String status) {
    return status == 'blocked' || status == 'bloqueado';
  }
}
