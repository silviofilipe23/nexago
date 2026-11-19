import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../data/arena_popular_times_repository.dart';
import 'arena_popular_times.dart';

final arenaPopularTimesRepositoryProvider =
    Provider<ArenaPopularTimesRepository>((ref) {
  return ArenaPopularTimesRepository(ref.watch(firestoreProvider));
});

/// Resumo de movimento da arena; `null` sem resumo. Erro de leitura também
/// esconde o bloco (é um extra, não trava a agenda).
final arenaPopularTimesProvider = StreamProvider.autoDispose
    .family<ArenaPopularTimes?, String>((ref, arenaId) {
  return ref
      .watch(arenaPopularTimesRepositoryProvider)
      .watch(arenaId)
      .handleError((Object _) {});
});
