import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_providers.dart';
import '../data/court_service.dart';
import 'arena_schedule_providers.dart';

final courtServiceProvider = Provider<CourtService>((ref) {
  return CourtService(ref.watch(firestoreProvider));
});

/// Quadras da arena gerida pelo usuário (mesma arena de [managedArenaIdProvider]).
final arenaManagedCourtsProvider =
    StreamProvider.autoDispose<List<ArenaCourt>>((ref) {
  final arenaAsync = ref.watch(managedArenaIdProvider);
  return arenaAsync.when(
    data: (arenaId) {
      if (arenaId == null || arenaId.isEmpty) {
        return Stream<List<ArenaCourt>>.value(<ArenaCourt>[]);
      }
      return ref.watch(courtsRepositoryProvider).watchCourts(arenaId);
    },
    loading: () => Stream<List<ArenaCourt>>.value(<ArenaCourt>[]),
    error: (_, __) => Stream<List<ArenaCourt>>.value(<ArenaCourt>[]),
  );
});
