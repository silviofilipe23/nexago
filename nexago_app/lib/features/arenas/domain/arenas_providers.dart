import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/arenas_repository.dart';
import 'arena_list_item.dart';

final firestoreProvider = Provider<FirebaseFirestore>((ref) {
  return FirebaseFirestore.instance;
});

final arenasRepositoryProvider = Provider<ArenasRepository>((ref) {
  return ArenasRepository(ref.watch(firestoreProvider));
});

/// Lista reativa de arenas (coleção `arenas`).
final arenasStreamProvider =
    StreamProvider.autoDispose<List<ArenaListItem>>((ref) {
  return ref.watch(arenasRepositoryProvider).watchArenas();
});

/// Uma arena por id (detalhe).
final arenaByIdProvider =
    StreamProvider.autoDispose.family<ArenaListItem?, String>((ref, arenaId) {
  return ref.watch(arenasRepositoryProvider).watchArena(arenaId);
});
