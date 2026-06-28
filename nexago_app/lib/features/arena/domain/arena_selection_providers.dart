import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../../arenas/domain/arenas_providers.dart';

final managedArenasBriefProvider =
    StreamProvider.autoDispose<List<ArenaListItem>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) {
    return Stream<List<ArenaListItem>>.value(const []);
  }
  return ref
      .watch(firestoreProvider)
      .collection('arenas')
      .where('managerUserId', isEqualTo: uid)
      .limit(30)
      .snapshots()
      .map((snap) {
    final list = snap.docs
        .map(ArenaListItem.fromFirestore)
        .toList(growable: false)
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return list;
  });
});

final currentArenaIdProvider =
    StateNotifierProvider<CurrentArenaIdController, String?>(
  (ref) => CurrentArenaIdController(),
);

class CurrentArenaIdController extends StateNotifier<String?> {
  CurrentArenaIdController() : super(null);

  void selectArena(String arenaId) {
    final id = arenaId.trim();
    state = id.isEmpty ? null : id;
  }
}

final needsArenaSelectionProvider = Provider.autoDispose<bool>((ref) {
  final arenas = ref.watch(managedArenasBriefProvider).valueOrNull ?? const [];
  if (arenas.length <= 1) return false;
  final selected = ref.watch(currentArenaIdProvider);
  return selected == null || selected.trim().isEmpty;
});
