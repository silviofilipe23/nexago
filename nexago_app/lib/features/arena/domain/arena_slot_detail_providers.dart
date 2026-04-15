import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arenas_providers.dart';
import 'arena_manager_booking.dart';
import '../data/arena_user_label_service.dart';

/// Snapshot em tempo real do documento em `arenaSlots` (exceto ids virtuais `v_`).
final arenaSlotLiveProvider =
    StreamProvider.autoDispose.family<ArenaSlot?, String>((ref, slotId) {
  if (slotId.isEmpty || slotId.startsWith('v_')) {
    return Stream<ArenaSlot?>.value(null);
  }
  return ref
      .watch(firestoreProvider)
      .collection('arenaSlots')
      .doc(slotId)
      .snapshots()
      .map(
    (s) {
      if (!s.exists) return null;
      return ArenaSlot.fromFirestore(s);
    },
  );
});

/// Dados de `arenaBookings/{bookingId}` para o gestor (pagamento, status da reserva).
final arenaBookingDetailMapProvider = StreamProvider.autoDispose
    .family<Map<String, dynamic>?, String>((ref, bookingId) {
  final id = bookingId.trim();
  if (id.isEmpty) {
    return Stream<Map<String, dynamic>?>.value(null);
  }
  return ref
      .watch(firestoreProvider)
      .collection('arenaBookings')
      .doc(id)
      .snapshots()
      .map(
        (s) => s.exists ? s.data() : null,
      );
});

final arenaUserLabelServiceProvider = Provider<ArenaUserLabelService>((ref) {
  return ArenaUserLabelService(ref.watch(firestoreProvider));
});

/// Nome ou e-mail do atleta em `users/{uid}` com cache local em memória.
final athleteDisplayLabelProvider =
    FutureProvider.autoDispose.family<String, String>((ref, athleteId) async {
  return ref.watch(arenaUserLabelServiceProvider).getLabel(athleteId);
});

class ArenaAthleteBlockInfo {
  const ArenaAthleteBlockInfo({
    required this.isBlocked,
    this.reason,
  });

  final bool isBlocked;
  final String? reason;
}

class AthleteArenaHistoryArgs {
  const AthleteArenaHistoryArgs({
    required this.athleteId,
    required this.arenaId,
  });

  final String athleteId;
  final String arenaId;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other is AthleteArenaHistoryArgs &&
            other.athleteId == athleteId &&
            other.arenaId == arenaId);
  }

  @override
  int get hashCode => Object.hash(athleteId, arenaId);
}

/// Histórico do atleta em uma arena específica.
///
/// Filtros:
/// - `athleteId`
/// - `arenaId`
final athleteArenaHistoryProvider = StreamProvider.autoDispose
    .family<List<ArenaManagerBooking>, AthleteArenaHistoryArgs>((ref, args) {
  final athleteId = args.athleteId.trim();
  final arenaId = args.arenaId.trim();
  if (athleteId.isEmpty || arenaId.isEmpty) {
    return Stream<List<ArenaManagerBooking>>.value(const []);
  }

  return ref
      .watch(firestoreProvider)
      .collection('arenaBookings')
      .where('athleteId', isEqualTo: athleteId)
      .where('arenaId', isEqualTo: arenaId)
      .limit(120)
      .snapshots()
      .map((snapshot) {
    final list = snapshot.docs.map(ArenaManagerBooking.fromFirestore).toList()
      ..sort((a, b) {
        final byDate = b.dateKey.compareTo(a.dateKey);
        if (byDate != 0) return byDate;
        return b.startTime.compareTo(a.startTime);
      });
    return list;
  });
});

/// Estado de bloqueio do atleta em uma arena (`arena_blocks/{arenaId_athleteId}`).
final arenaAthleteBlockProvider = StreamProvider.autoDispose
    .family<ArenaAthleteBlockInfo, AthleteArenaHistoryArgs>((ref, args) {
  final athleteId = args.athleteId.trim();
  final arenaId = args.arenaId.trim();
  if (athleteId.isEmpty || arenaId.isEmpty) {
    return Stream.value(const ArenaAthleteBlockInfo(isBlocked: false));
  }
  final docId =
      '${arenaId.replaceAll('/', '_')}_${athleteId.replaceAll('/', '_')}';
  return ref
      .watch(firestoreProvider)
      .collection('arena_blocks')
      .doc(docId)
      .snapshots()
      .map((snap) {
    if (!snap.exists) {
      return const ArenaAthleteBlockInfo(isBlocked: false);
    }
    final data = snap.data() ?? <String, dynamic>{};
    final reason = (data['reason'] as String?)?.trim();
    return ArenaAthleteBlockInfo(
      isBlocked: true,
      reason: reason != null && reason.isNotEmpty ? reason : null,
    );
  });
});
