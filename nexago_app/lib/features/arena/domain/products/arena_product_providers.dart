import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/arena_products_repository.dart';
import '../arena_providers.dart';
import 'arena_product.dart';
import 'arena_product_category.dart';
import 'arena_product_logic.dart';
import 'arena_stock_movement.dart';

final arenaProductsRepositoryProvider = Provider<ArenaProductsRepository>((ref) {
  return ArenaProductsRepository(
    FirebaseFirestore.instance,
    FirebaseAuth.instance,
    FirebaseStorage.instance,
  );
});

final arenaProductsStreamProvider =
    StreamProvider.autoDispose.family<List<ArenaProduct>, String>((ref, arenaId) {
  final id = arenaId.trim();
  if (id.isEmpty) return Stream.value(const []);

  return ref.watch(arenaProductsRepositoryProvider).watchProducts(id);
});

final arenaProductSummaryProvider =
    Provider.autoDispose.family<ArenaProductSummary, String>((ref, arenaId) {
  final products = ref.watch(arenaProductsStreamProvider(arenaId)).valueOrNull ??
      const <ArenaProduct>[];
  return buildProductSummary(products);
});

final arenaProductProvider = FutureProvider.autoDispose
    .family<ArenaProduct?, ({String arenaId, String productId})>((ref, args) {
  final arenaId = args.arenaId.trim();
  final productId = args.productId.trim();
  if (arenaId.isEmpty || productId.isEmpty) return Future.value(null);
  return ref
      .watch(arenaProductsRepositoryProvider)
      .getProduct(arenaId: arenaId, productId: productId);
});

final arenaProductMovementsProvider = StreamProvider.autoDispose
    .family<List<ArenaStockMovement>, ({String arenaId, String productId})>(
  (ref, args) {
    final arenaId = args.arenaId.trim();
    final productId = args.productId.trim();
    if (arenaId.isEmpty || productId.isEmpty) {
      return Stream.value(const []);
    }
    return ref.watch(arenaProductsRepositoryProvider).watchMovements(
          arenaId: arenaId,
          productId: productId,
          limit: 30,
        );
  },
);

final arenaStockTurnover7dProvider =
    FutureProvider.autoDispose.family<int, String>((ref, arenaId) async {
  final id = arenaId.trim();
  if (id.isEmpty) return 0;
  final movements =
      await ref.watch(arenaProductsRepositoryProvider).fetchMovementsSince(
            arenaId: id,
            since: DateTime.now().subtract(const Duration(days: 7)),
          );
  return computeTurnover7d(movements);
});

/// Resumo para tile em Ajustes (usa arena gerenciada).
final managedArenaProductSummaryProvider =
    Provider.autoDispose<ArenaProductSummary>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
  if (arenaId.isEmpty) {
    return const ArenaProductSummary(
      activeCount: 0,
      lowCount: 0,
      outCount: 0,
      inventoryValueCents: 0,
    );
  }
  return ref.watch(arenaProductSummaryProvider(arenaId));
});

final arenaProductsCategoryFilterProvider =
    StateProvider.autoDispose<ArenaProductCategory?>((ref) => null);

final arenaProductsFilteredProvider =
    Provider.autoDispose.family<List<ArenaProduct>, String>((ref, arenaId) {
  final products =
      ref.watch(arenaProductsStreamProvider(arenaId)).valueOrNull ??
          const <ArenaProduct>[];
  final category = ref.watch(arenaProductsCategoryFilterProvider);
  return sortProductsByName(filterProductsByCategory(products, category));
});

final arenaStockAlertsProvider =
    Provider.autoDispose.family<({List<ArenaProduct> out, List<ArenaProduct> low}), String>(
  (ref, arenaId) {
    final products =
        ref.watch(arenaProductsStreamProvider(arenaId)).valueOrNull ??
            const <ArenaProduct>[];
    return (
      out: sortProductsByName(productsOutOfStock(products)),
      low: sortProductsByName(productsLowStock(products)),
    );
  },
);
