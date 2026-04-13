import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../../../core/auth/auth_providers.dart';
import '../data/slot_service.dart';
import 'arena_date_utils.dart';

/// Dia selecionado na agenda (somente data civil).
final arenaScheduleSelectedDateProvider =
    StateProvider<DateTime>((ref) {
  return arenaTodayDateOnly();
});

/// Primeira arena em que o usuário é `managerUserId` (ajustar se houver várias).
final managedArenaIdProvider = StreamProvider<String?>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null) {
    return Stream<String?>.value(null);
  }
  final fs = ref.watch(firestoreProvider);
  return fs
      .collection('arenas')
      .where('managerUserId', isEqualTo: uid)
      .limit(1)
      .snapshots()
      .map((s) => s.docs.isEmpty ? null : s.docs.first.id);
});

final slotServiceProvider = Provider<SlotService>((ref) {
  return SlotService(
    ref.watch(slotsRepositoryProvider),
    ref.watch(firestoreProvider),
  );
});

/// Slots do dia (todas as quadras) para a arena gerida.
final arenaScheduleSlotsProvider =
    StreamProvider.autoDispose<List<ArenaSlot>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  final date = ref.watch(arenaScheduleSelectedDateProvider);

  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaSlot>>.value(<ArenaSlot>[]);
      }
      return ref.watch(slotServiceProvider).watchArenaDaySlots(
            arenaId: arenaId,
            date: date,
          );
    },
    loading: () => Stream<List<ArenaSlot>>.value(<ArenaSlot>[]),
    error: (_, __) => Stream<List<ArenaSlot>>.value(<ArenaSlot>[]),
  );
});
