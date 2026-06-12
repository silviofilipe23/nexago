import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../domain/products/arena_product.dart';
import '../domain/products/arena_product_logic.dart';
import '../domain/products/arena_stock_movement.dart';

class ArenaProductsRepository {
  ArenaProductsRepository(
    this._firestore,
    this._auth,
    this._storage,
  );

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;
  final FirebaseStorage _storage;

  CollectionReference<Map<String, dynamic>> _products(String arenaId) =>
      _firestore.collection('arenas').doc(arenaId).collection('products');

  CollectionReference<Map<String, dynamic>> _movements(String arenaId) =>
      _firestore.collection('arenas').doc(arenaId).collection('stockMovements');

  Stream<List<ArenaProduct>> watchProducts(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _products(id)
        .orderBy('nameLower')
        .limit(100)
        .snapshots()
        .map(
          (snap) => snap.docs.map(ArenaProduct.fromFirestore).toList(),
        );
  }

  Future<ArenaProduct?> getProduct({
    required String arenaId,
    required String productId,
  }) async {
    final doc = await _products(arenaId.trim()).doc(productId.trim()).get();
    if (!doc.exists) return null;
    return ArenaProduct.fromFirestore(doc);
  }

  Future<String> createProduct({
    required String arenaId,
    required ArenaProduct product,
  }) async {
    final id = arenaId.trim();
    final ref = await _products(id).add(product.toFirestore(isCreate: true));
    return ref.id;
  }

  Future<void> updateProduct({
    required String arenaId,
    required ArenaProduct product,
  }) async {
    final id = arenaId.trim();
    await _products(id).doc(product.id).update(product.toFirestore());
  }

  Future<void> deleteProduct({
    required String arenaId,
    required String productId,
  }) async {
    await _products(arenaId.trim()).doc(productId.trim()).delete();
  }

  /// Recria produto excluído (desfazer exclusão).
  Future<void> restoreProduct({
    required String arenaId,
    required ArenaProduct product,
  }) async {
    final ref = _products(arenaId.trim()).doc(product.id);
    final data = product.toFirestore();
    if (product.createdAt != null) {
      data['createdAt'] = Timestamp.fromDate(product.createdAt!);
    }
    await ref.set(data);
  }

  /// Desativa produto (preferível a delete quando há histórico).
  Future<void> deactivateProduct({
    required String arenaId,
    required String productId,
  }) async {
    await _products(arenaId.trim()).doc(productId.trim()).update({
      'active': false,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> registerStockMovement({
    required String arenaId,
    required String productId,
    required ArenaStockMovementType type,
    required int quantity,
    String? note,
  }) async {
    final managerUid = _auth.currentUser?.uid;
    if (managerUid == null || managerUid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final arenaRef = arenaId.trim();
    final productRef = _products(arenaRef).doc(productId.trim());
    final delta = signedDeltaForMovementType(type: type, quantity: quantity);

    await _firestore.runTransaction((txn) async {
      final productSnap = await txn.get(productRef);
      if (!productSnap.exists) {
        throw StateError('Produto não encontrado.');
      }

      final product = ArenaProduct.fromFirestore(productSnap);
      final before = product.stockQuantity;
      final after = previewRestock(currentQuantity: before, delta: delta);
      if (after < 0) {
        throw StateError('Estoque não pode ficar negativo.');
      }

      final movement = ArenaStockMovement(
        id: '',
        productId: product.id,
        productName: product.name,
        type: type,
        quantityDelta: delta,
        quantityBefore: before,
        quantityAfter: after,
        createdByUid: managerUid,
        note: note,
      );

      final movementRef = _movements(arenaRef).doc();
      txn.set(movementRef, movement.toFirestore());
      txn.update(productRef, {
        'stockQuantity': after,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    });
  }

  Stream<List<ArenaStockMovement>> watchMovements({
    required String arenaId,
    required String productId,
    int limit = 30,
  }) {
    final id = arenaId.trim();
    final pid = productId.trim();
    if (id.isEmpty || pid.isEmpty) return Stream.value(const []);

    return _movements(id)
        .where('productId', isEqualTo: pid)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map(
          (snap) => snap.docs.map(ArenaStockMovement.fromFirestore).toList(),
        );
  }

  Future<List<ArenaStockMovement>> fetchMovementsSince({
    required String arenaId,
    required DateTime since,
  }) async {
    final id = arenaId.trim();
    if (id.isEmpty) return const [];

    final snap = await _movements(id)
        .where(
          'createdAt',
          isGreaterThanOrEqualTo: Timestamp.fromDate(since),
        )
        .orderBy('createdAt', descending: true)
        .limit(200)
        .get();

    return snap.docs.map(ArenaStockMovement.fromFirestore).toList();
  }

  Future<String> uploadProductImage({
    required String arenaId,
    required String productId,
    required Uint8List bytes,
    required String contentType,
  }) async {
    final ref = _storage
        .ref()
        .child('arenas')
        .child(arenaId.trim())
        .child('products')
        .child('${productId.trim()}.jpg');

    await ref.putData(bytes, SettableMetadata(contentType: contentType));
    return ref.getDownloadURL();
  }
}
