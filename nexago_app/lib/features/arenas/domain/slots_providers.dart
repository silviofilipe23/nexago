import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/coupons_repository.dart';
import '../data/courts_repository.dart';
import '../data/peak_rules_repository.dart';
import '../data/promotions_repository.dart';
import '../data/slots_repository.dart';
import 'arena_coupon.dart';
import 'arena_court.dart';
import 'arena_peak_rule.dart';
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

/// Todas as promoções da arena (gestor), inclusive pausadas.
final arenaAllPromotionsProvider =
    StreamProvider.autoDispose.family<List<ArenaPromotion>, String>(
  (ref, arenaId) {
    return ref.watch(promotionsRepositoryProvider).watchAllPromotions(arenaId);
  },
);

final peakRulesRepositoryProvider = Provider<PeakRulesRepository>((ref) {
  return PeakRulesRepository(ref.watch(firestoreProvider));
});

/// Regras de pico ativas da arena (`arenas/{arenaId}/peakRules`).
final arenaPeakRulesProvider =
    StreamProvider.autoDispose.family<List<ArenaPeakRule>, String>(
  (ref, arenaId) {
    return ref.watch(peakRulesRepositoryProvider).watchActivePeakRules(arenaId);
  },
);

final couponsRepositoryProvider = Provider<CouponsRepository>((ref) {
  return CouponsRepository();
});

/// Cupons da arena (gestor), inclusive desativados — filtro fica na UI.
/// `FutureProvider` (não `StreamProvider`): listagem é via callable
/// (`listArenaCoupons`), não Firestore stream — invalide após
/// criar/desativar pra atualizar.
final arenaCouponsProvider =
    FutureProvider.autoDispose.family<List<ArenaCoupon>, String>(
  (ref, arenaId) {
    return ref.watch(couponsRepositoryProvider).listCoupons(arenaId);
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

/// `arenaSlots` de todas as quadras da arena no dia (um listener só), com a
/// grade virtual e as promoções aplicadas.
final arenaDaySlotsProvider = StreamProvider.autoDispose
    .family<List<ArenaSlot>, ({String arenaId, DateTime day})>((ref, params) {
  return ref
      .watch(slotsRepositoryProvider)
      .watchArenaDaySlotsMerged(arenaId: params.arenaId, date: params.day);
});

/// Mesma grade de [arenaDaySlotsProvider] para [days] dias seguidos a partir
/// de `from` — as mesmas quatro consultas, então a faixa de dias inteira não
/// abre leitura nova.
final arenaRangeSlotsProvider = StreamProvider.autoDispose.family<
    List<ArenaSlot>,
    ({String arenaId, DateTime from, int days})>((ref, params) {
  return ref.watch(slotsRepositoryProvider).watchArenaRangeSlotsMerged(
        arenaId: params.arenaId,
        from: params.from,
        days: params.days,
      );
});
