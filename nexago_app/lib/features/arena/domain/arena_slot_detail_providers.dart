import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../data/arena_user_label_service.dart';

/// Snapshot em tempo real do documento em `arenaSlots` (exceto ids virtuais `v_`).
final arenaSlotLiveProvider =
    StreamProvider.autoDispose.family<ArenaSlot?, String>((ref, slotId) {
  if (slotId.isEmpty || slotId.startsWith('v_')) {
    return Stream<ArenaSlot?>.value(null);
  }
  return ref.watch(firestoreProvider).collection('arenaSlots').doc(slotId).snapshots().map(
        (s) {
          if (!s.exists) return null;
          return ArenaSlot.fromFirestore(s);
        },
      );
});

/// Dados de `arenaBookings/{bookingId}` para o gestor (pagamento, status da reserva).
final arenaBookingDetailMapProvider =
    StreamProvider.autoDispose.family<Map<String, dynamic>?, String>((ref, bookingId) {
  final id = bookingId.trim();
  if (id.isEmpty) {
    return Stream<Map<String, dynamic>?>.value(null);
  }
  return ref.watch(firestoreProvider).collection('arenaBookings').doc(id).snapshots().map(
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
