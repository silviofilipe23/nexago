import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/store_checkout_models.dart';
import '../domain/store_checkout_rules.dart';
import '../domain/store_checkout_service.dart';
import '../domain/store_order_rules.dart';
import 'firestore_store_repository.dart';

/// Endereços, linhas do carrinho e a visão dos pedidos no Firestore — tudo
/// só do dono (`storeAddresses`, `storeCarts`, `storeOrderViews`).
class FirestoreStoreCheckoutRepository implements StoreCheckoutRepository {
  FirestoreStoreCheckoutRepository(this._db);

  final FirebaseFirestore _db;

  @override
  Stream<List<StoreAddress>> watchAddresses(String uid) => _db
      .collection('storeAddresses')
      .doc(uid)
      .snapshots()
      .map((snap) => storeAddressesFromMap(snap.data()));

  @override
  Future<void> saveAddresses(String uid, List<StoreAddress> items) =>
      _db.collection('storeAddresses').doc(uid).set({
        'items': [for (final a in items) storeAddressToMap(a)],
        'updatedAt': FieldValue.serverTimestamp(),
      });

  /// Transação, igual ao "adicionar": outro aparelho pode ter mexido no
  /// carrinho. A lista vai inteira e sem `FieldValue` dentro (a rule só
  /// aceita `items` + `updatedAt`).
  @override
  Future<void> setCartLineQty(String uid, String key, int qty) {
    final ref = _db.collection('storeCarts').doc(uid);
    return _db.runTransaction<void>((tx) async {
      final snap = await tx.get(ref);
      final items = storeCartWithLineQty(
        storeCartItemsFromMap(snap.data()),
        key,
        qty,
      );
      tx.set(ref, {
        'items': [for (final item in items) item.toMap()],
        'updatedAt': FieldValue.serverTimestamp(),
      });
    });
  }

  @override
  Stream<List<StoreOrderView>> watchOrders(String uid) => _db
      .collection('storeOrderViews')
      .where('uid', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(
        (snap) => [
          for (final doc in snap.docs)
            if (storeOrderViewFromMap(doc.id, doc.data()) case final o?) o,
        ],
      );

  /// Doc que ainda não existe (o gatilho espelha o pedido ~1 s depois do
  /// checkout) chega como `null`, não erro: a rule deixa o `get` de doc
  /// inexistente passar justamente pra este listener.
  @override
  Stream<StoreOrderView?> watchOrder(String orderId) =>
      _db.collection('storeOrderViews').doc(orderId).snapshots().map((snap) =>
          snap.exists ? storeOrderViewFromMap(snap.id, snap.data()) : null);
}

final storeCheckoutRepositoryProvider =
    Provider<StoreCheckoutRepository>((ref) {
  return FirestoreStoreCheckoutRepository(ref.watch(firestoreProvider));
});
