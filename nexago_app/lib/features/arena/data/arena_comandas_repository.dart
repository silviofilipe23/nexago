import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../domain/comandas/arena_comanda.dart';
import '../domain/comandas/arena_comanda_draft.dart';
import '../domain/comandas/arena_comanda_item.dart';
import '../domain/comandas/arena_comanda_logic.dart';
import '../domain/comandas/arena_comanda_payment.dart';
import '../domain/arena_bookings_grouping.dart';
import '../domain/products/arena_product.dart';
import '../domain/products/arena_product_logic.dart';
import '../domain/products/arena_stock_movement.dart';

class ArenaComandasRepository {
  ArenaComandasRepository(this._firestore, this._auth);

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _comandas =>
      _firestore.collection('arenaComandas');

  DocumentReference<Map<String, dynamic>> _counterRef(String arenaId) =>
      _firestore
          .collection('arenas')
          .doc(arenaId.trim())
          .collection('metadata')
          .doc('comandaCounter');

  CollectionReference<Map<String, dynamic>> _products(String arenaId) =>
      _firestore.collection('arenas').doc(arenaId.trim()).collection('products');

  CollectionReference<Map<String, dynamic>> _movements(String arenaId) =>
      _firestore
          .collection('arenas')
          .doc(arenaId.trim())
          .collection('stockMovements');

  CollectionReference<Map<String, dynamic>> _items(String comandaId) =>
      _comandas.doc(comandaId.trim()).collection('items');

  CollectionReference<Map<String, dynamic>> _payments(String comandaId) =>
      _comandas.doc(comandaId.trim()).collection('payments');

  Stream<List<ArenaComanda>> watchComandas(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _comandas
        .where('arenaId', isEqualTo: id)
        .orderBy('openedAt', descending: true)
        .limit(50)
        .snapshots()
        .map(
          (snap) => snap.docs.map(ArenaComanda.fromFirestore).toList(),
        );
  }

  Stream<ArenaComanda?> watchComanda(String comandaId) {
    final id = comandaId.trim();
    if (id.isEmpty) return Stream.value(null);

    return _comandas.doc(id).snapshots().map((doc) {
      if (!doc.exists) return null;
      return ArenaComanda.fromFirestore(doc);
    });
  }

  Stream<List<ArenaComandaItem>> watchComandaItems(String comandaId) {
    final id = comandaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _items(id)
        .orderBy('createdAt', descending: true)
        .limit(50)
        .snapshots()
        .map(
          (snap) => snap.docs.map(ArenaComandaItem.fromFirestore).toList(),
        );
  }

  Stream<List<ArenaComandaPayment>> watchComandaPayments(String comandaId) {
    final id = comandaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _payments(id)
        .orderBy('createdAt', descending: true)
        .limit(50)
        .snapshots()
        .map(
          (snap) => snap.docs.map(ArenaComandaPayment.fromFirestore).toList(),
        );
  }

  Future<ArenaComanda?> getComanda(String comandaId) async {
    final doc = await _comandas.doc(comandaId.trim()).get();
    if (!doc.exists) return null;
    return ArenaComanda.fromFirestore(doc);
  }

  Future<ArenaComanda> createComanda({
    required String arenaId,
    required ArenaComandaDraft draft,
  }) async {
    final managerUid = _auth.currentUser?.uid;
    if (managerUid == null || managerUid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    if (!isValidComandaDraftForCreate(draft)) {
      throw ArgumentError('Dados da comanda incompletos.');
    }

    final arenaRef = arenaId.trim();
    final booking = draft.linkedBooking;
    final rentalCents = booking != null ? rentalCentsFromBooking(booking) : 0;
    final locationLabel = booking != null
        ? (booking.courtName.isNotEmpty ? booking.courtName : null)
        : null;
    final bookingDisplayCode = booking != null
        ? ArenaBookingsGrouping.displayCode(booking.id)
        : null;

    late String comandaId;
    late int displayNumber;

    await _firestore.runTransaction((txn) async {
      final counterSnap = await txn.get(_counterRef(arenaRef));
      final lastNumber = counterSnap.exists
          ? (counterSnap.data()?['lastNumber'] as num?)?.toInt() ?? 0
          : 0;
      displayNumber = lastNumber + 1;

      final comandaRef = _comandas.doc();
      comandaId = comandaRef.id;

      final comanda = ArenaComanda(
        id: comandaId,
        arenaId: arenaRef,
        displayNumber: displayNumber,
        type: draft.type,
        status: ArenaComandaStatus.open,
        bookingId: booking?.id,
        bookingDisplayCode: bookingDisplayCode,
        locationLabel: locationLabel,
        customerName: draft.customerName.trim(),
        customerWhatsapp: draft.customerWhatsapp.trim().isEmpty
            ? null
            : draft.customerWhatsapp.trim(),
        customerCpf:
            draft.customerCpf.trim().isEmpty ? null : draft.customerCpf.trim(),
        allowAppOrders: draft.allowAppOrders,
        rentalCents: rentalCents,
        itemsTotalCents: 0,
        totalCents: rentalCents,
        itemsCount: 0,
        paidCents: 0,
        openedByUid: managerUid,
      );

      txn.set(comandaRef, comanda.toFirestore(isCreate: true));
      txn.set(_counterRef(arenaRef), {
        'lastNumber': displayNumber,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    final created = await getComanda(comandaId);
    if (created == null) {
      throw StateError('Comanda criada mas não encontrada.');
    }
    return created;
  }

  Future<void> addItemsBatch({
    required String arenaId,
    required String comandaId,
    required List<ArenaComandaAddItemLine> lines,
  }) async {
    if (lines.isEmpty) return;

    final managerUid = _auth.currentUser?.uid;
    if (managerUid == null || managerUid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final managerName = _auth.currentUser?.displayName?.trim();
    final addedByName =
        (managerName != null && managerName.isNotEmpty) ? managerName : 'Gestor';

    final arenaRef = arenaId.trim();
    final comandaRef = _comandas.doc(comandaId.trim());

    await _firestore.runTransaction((txn) async {
      final comandaSnap = await txn.get(comandaRef);
      if (!comandaSnap.exists) {
        throw StateError('Comanda não encontrada.');
      }

      final comanda = ArenaComanda.fromFirestore(comandaSnap);
      if (comanda.arenaId != arenaRef) {
        throw StateError('Comanda não pertence a esta arena.');
      }
      if (!comanda.status.isActive) {
        throw StateError('Comanda não está aberta para lançamentos.');
      }

      final validLines =
          lines.where((line) => line.quantity > 0).toList(growable: false);
      if (validLines.isEmpty) return;

      final notePrefix =
          'comanda ${formatComandaNumber(comanda.displayNumber)}';

      // Firestore exige todas as leituras antes de qualquer escrita.
      final productIds = validLines
          .map((line) => line.productId.trim())
          .where((id) => id.isNotEmpty)
          .toSet();
      final productSnaps = <String, DocumentSnapshot<Map<String, dynamic>>>{};
      for (final productId in productIds) {
        productSnaps[productId] =
            await txn.get(_products(arenaRef).doc(productId));
      }

      var addedItemsTotal = 0;
      var addedItemsCount = 0;
      final stockAfterByProduct = <String, int>{};
      final pendingLines = <({
        ArenaProduct product,
        ArenaComandaItem item,
        ArenaStockMovement movement,
      })>[];

      for (final line in validLines) {
        final productId = line.productId.trim();
        final productSnap = productSnaps[productId];
        if (productSnap == null || !productSnap.exists) {
          throw StateError('Produto não encontrado.');
        }

        final product = ArenaProduct.fromFirestore(productSnap);
        if (!product.active) {
          throw StateError('Produto "${product.name}" está inativo.');
        }

        final delta = signedDeltaForMovementType(
          type: ArenaStockMovementType.sale,
          quantity: line.quantity,
        );
        final productData = productSnap.data() ?? {};
        final initialStock =
            (productData['stockQuantity'] as num?)?.toInt() ?? 0;
        final before = stockAfterByProduct.putIfAbsent(
          productId,
          () => initialStock,
        );
        final after = previewRestock(currentQuantity: before, delta: delta);
        if (after < 0) {
          throw StateError('Estoque insuficiente para "${product.name}".');
        }
        stockAfterByProduct[productId] = after;

        final lineTotalCents = product.priceCents * line.quantity;
        addedItemsTotal += lineTotalCents;
        addedItemsCount += line.quantity;

        pendingLines.add((
          product: product,
          item: ArenaComandaItem(
            id: '',
            productId: product.id,
            productName: product.name,
            emoji: product.emoji,
            quantity: line.quantity,
            unitPriceCents: product.priceCents,
            lineTotalCents: lineTotalCents,
            source: ArenaComandaItemSource.counter,
            addedByName: addedByName,
            addedByUid: managerUid,
          ),
          movement: ArenaStockMovement(
            id: '',
            productId: product.id,
            productName: product.name,
            type: ArenaStockMovementType.sale,
            quantityDelta: delta,
            quantityBefore: before,
            quantityAfter: after,
            createdByUid: managerUid,
            note: notePrefix,
          ),
        ));
      }

      for (final pending in pendingLines) {
        final itemRef = _items(comanda.id).doc();
        txn.set(itemRef, pending.item.toFirestore());

        final movementRef = _movements(arenaRef).doc();
        txn.set(movementRef, pending.movement.toFirestore());
      }

      for (final entry in stockAfterByProduct.entries) {
        txn.update(_products(arenaRef).doc(entry.key), {
          'stockQuantity': entry.value,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }

      final newItemsTotal = comanda.itemsTotalCents + addedItemsTotal;
      final newItemsCount = comanda.itemsCount + addedItemsCount;
      final newTotal = comanda.rentalCents + newItemsTotal;

      final comandaUpdate = <String, dynamic>{
        'itemsTotalCents': newItemsTotal,
        'itemsCount': newItemsCount,
        'totalCents': newTotal,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      final existingData = comandaSnap.data();
      if (existingData == null || !existingData.containsKey('paidCents')) {
        comandaUpdate['paidCents'] = comanda.paidCents;
      }
      if (existingData == null || !existingData.containsKey('status')) {
        comandaUpdate['status'] = comanda.status.firestoreValue;
      }

      txn.update(comandaRef, comandaUpdate);
    });
  }

  Future<void> reverseComandaItem({
    required String arenaId,
    required String comandaId,
    required String itemId,
  }) async {
    final managerUid = _auth.currentUser?.uid;
    if (managerUid == null || managerUid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final arenaRef = arenaId.trim();
    final comandaRef = _comandas.doc(comandaId.trim());
    final itemRef = _items(comandaId.trim()).doc(itemId.trim());

    await _firestore.runTransaction((txn) async {
      final comandaSnap = await txn.get(comandaRef);
      if (!comandaSnap.exists) {
        throw StateError('Comanda não encontrada.');
      }

      final itemSnap = await txn.get(itemRef);
      if (!itemSnap.exists) {
        throw StateError('Item não encontrado.');
      }

      final comanda = ArenaComanda.fromFirestore(comandaSnap);
      final item = ArenaComandaItem.fromFirestore(itemSnap);

      if (comanda.arenaId != arenaRef) {
        throw StateError('Comanda não pertence a esta arena.');
      }

      final blockReason = comandaItemReverseBlockReason(comanda, item);
      if (blockReason != null) {
        throw StateError(blockReason);
      }

      final notePrefix =
          'estorno comanda ${formatComandaNumber(comanda.displayNumber)}';

      final productRef = _products(arenaRef).doc(item.productId.trim());
      final productSnap = await txn.get(productRef);
      if (productSnap.exists) {
        final product = ArenaProduct.fromFirestore(productSnap);
        final productData = productSnap.data() ?? {};
        final before = (productData['stockQuantity'] as num?)?.toInt() ?? 0;
        final delta = signedDeltaForMovementType(
          type: ArenaStockMovementType.adjustment,
          quantity: item.quantity,
        );
        final after = previewRestock(currentQuantity: before, delta: delta);

        final movement = ArenaStockMovement(
          id: '',
          productId: product.id,
          productName: product.name,
          type: ArenaStockMovementType.adjustment,
          quantityDelta: delta,
          quantityBefore: before,
          quantityAfter: after,
          createdByUid: managerUid,
          note: notePrefix,
        );
        final movementRef = _movements(arenaRef).doc();
        txn.set(movementRef, movement.toFirestore());

        txn.update(productRef, {
          'stockQuantity': after,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }

      txn.delete(itemRef);

      final newItemsTotal = comanda.itemsTotalCents - item.lineTotalCents;
      final newItemsCount = comanda.itemsCount - item.quantity;
      final newTotal = comanda.rentalCents + newItemsTotal;

      final comandaUpdate = <String, dynamic>{
        'itemsTotalCents': newItemsTotal,
        'itemsCount': newItemsCount < 0 ? 0 : newItemsCount,
        'totalCents': newTotal,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      final existingData = comandaSnap.data();
      if (existingData == null || !existingData.containsKey('paidCents')) {
        comandaUpdate['paidCents'] = comanda.paidCents;
      }
      if (existingData == null || !existingData.containsKey('status')) {
        comandaUpdate['status'] = comanda.status.firestoreValue;
      }

      txn.update(comandaRef, comandaUpdate);
    });
  }

  Future<({ArenaComanda comanda, ArenaComandaPayment payment})> registerPayment({
    required String comandaId,
    required ArenaComandaPaymentMethod method,
    required int amountCents,
    required String payerName,
  }) async {
    final managerUid = _auth.currentUser?.uid;
    if (managerUid == null || managerUid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }
    if (amountCents <= 0) {
      throw ArgumentError('Valor do pagamento inválido.');
    }

    final comandaRef = _comandas.doc(comandaId.trim());
    late ArenaComanda updated;
    late ArenaComandaPayment createdPayment;

    await _firestore.runTransaction((txn) async {
      final comandaSnap = await txn.get(comandaRef);
      if (!comandaSnap.exists) {
        throw StateError('Comanda não encontrada.');
      }

      final comanda = ArenaComanda.fromFirestore(comandaSnap);
      if (!comanda.status.isActive) {
        throw StateError('Comanda não está aberta para pagamento.');
      }

      final paymentRef = _payments(comanda.id).doc();
      createdPayment = ArenaComandaPayment(
        id: paymentRef.id,
        method: method,
        amountCents: amountCents,
        payerName: payerName.trim(),
        receivedByUid: managerUid,
        createdAt: DateTime.now(),
      );
      txn.set(paymentRef, createdPayment.toFirestore());

      final newPaidCents = comanda.paidCents + amountCents;
      final newStatus = newPaidCents >= comanda.totalCents
          ? ArenaComandaStatus.closed
          : ArenaComandaStatus.partiallyPaid;

      txn.update(comandaRef, {
        'paidCents': newPaidCents,
        'status': newStatus.firestoreValue,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      updated = comanda.copyWith(
        paidCents: newPaidCents,
        status: newStatus,
      );
    });

    return (comanda: updated, payment: createdPayment);
  }
}

extension on ArenaComanda {
  ArenaComanda copyWith({
    int? paidCents,
    ArenaComandaStatus? status,
  }) {
    return ArenaComanda(
      id: id,
      arenaId: arenaId,
      displayNumber: displayNumber,
      type: type,
      status: status ?? this.status,
      bookingId: bookingId,
      bookingDisplayCode: bookingDisplayCode,
      locationLabel: locationLabel,
      customerName: customerName,
      customerWhatsapp: customerWhatsapp,
      customerCpf: customerCpf,
      allowAppOrders: allowAppOrders,
      rentalCents: rentalCents,
      itemsTotalCents: itemsTotalCents,
      totalCents: totalCents,
      itemsCount: itemsCount,
      paidCents: paidCents ?? this.paidCents,
      openedByUid: openedByUid,
      openedAt: openedAt,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}
