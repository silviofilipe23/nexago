import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/courts_repository.dart';
import '../data/promotions_repository.dart';
import '../data/slots_repository.dart';
import 'arena_court.dart';
import 'arena_promotion.dart';
import 'arena_slot.dart';
import 'arenas_providers.dart';
import 'slots_query.dart';

final courtsRepositoryProvider = Provider<CourtsRepository>((ref) {
  return CourtsRepository(ref.watch(firestoreProvider));
});

final slotsRepositoryProvider = Provider<SlotsRepository>((ref) {
  return SlotsRepository(ref.watch(firestoreProvider));
});

final promotionsRepositoryProvider = Provider<PromotionsRepository>((ref) {
  return PromotionsRepository(ref.watch(firestoreProvider));
});

/// Promoções ativas da arena (`arenas/{arenaId}/promotions`).
final arenaPromotionsProvider =
    StreamProvider.autoDispose.family<List<ArenaPromotion>, String>(
  (ref, arenaId) {
    return ref.watch(promotionsRepositoryProvider).watchPromotions(arenaId);
  },
);

/// Quadras da arena (`arenas/{arenaId}/courts`).
final courtsStreamProvider =
    StreamProvider.autoDispose.family<List<ArenaCourt>, String>((ref, arenaId) {
  return ref.watch(courtsRepositoryProvider).watchCourts(arenaId);
});

/// Slots do dia para arena + quadra (coleção `arenaSlots`).
final slotsStreamProvider =
    StreamProvider.autoDispose.family<List<ArenaSlot>, SlotsQuery>((ref, query) {
  return ref.watch(slotsRepositoryProvider).watchSlots(query);
});
