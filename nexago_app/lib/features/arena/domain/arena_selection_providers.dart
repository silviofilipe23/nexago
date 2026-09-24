import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_access_providers.dart';

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

/// Bloqueia o painel ate escolher, quando o usuario alcanca mais de uma arena
/// (dono de uma e equipe de outra, por exemplo).
final needsArenaSelectionProvider = Provider<bool>((ref) {
  final arenas = ref.watch(arenaMembershipsProvider).valueOrNull ?? const [];
  if (arenas.length <= 1) return false;
  final selected = ref.watch(currentArenaIdProvider);
  if (selected == null || selected.trim().isEmpty) return true;
  return !arenas.any((m) => m.arenaId == selected.trim());
});
