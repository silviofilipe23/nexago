import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/store_review_models.dart';
import '../domain/store_review_service.dart';

/// Avaliações no Firestore. `storeOrderReviews` só o dono lê (a rule exige
/// o `where uid` na lista); o espelho `storeShowcase/{id}/reviews` é público.
/// Ninguém grava do cliente: só a callable.
class FirestoreStoreReviewRepository implements StoreReviewRepository {
  FirestoreStoreReviewRepository(this._db);

  final FirebaseFirestore _db;

  /// Tamanho da lista da página do produto (as mais recentes).
  static const int productReviewsLimit = 100;

  @override
  Stream<Map<String, StoreOrderReview>> watchMyOrderReviews(String uid) => _db
      .collection('storeOrderReviews')
      .where('uid', isEqualTo: uid)
      .snapshots()
      .map(
        (snap) => {
          for (final doc in snap.docs)
            if (storeOrderReviewFromMap(doc.id, doc.data()) case final r?)
              r.orderId: r,
        },
      );

  /// Doc inexistente chega como `null` (a rule deixa o `get` passar).
  @override
  Stream<StoreOrderReview?> watchOrderReview(String orderId) => _db
      .collection('storeOrderReviews')
      .doc(orderId)
      .snapshots()
      .map(
        (snap) =>
            snap.exists ? storeOrderReviewFromMap(snap.id, snap.data()) : null,
      );

  @override
  Stream<List<StorePublicReview>> watchProductReviews(String productId) => _db
      .collection('storeShowcase')
      .doc(productId)
      .collection('reviews')
      .orderBy('createdAt', descending: true)
      .limit(productReviewsLimit)
      .snapshots()
      .map(
        (snap) => [
          for (final doc in snap.docs)
            ?storePublicReviewFromMap(doc.id, doc.data()),
        ],
      );
}

final storeReviewRepositoryProvider = Provider<StoreReviewRepository>((ref) {
  return FirestoreStoreReviewRepository(ref.watch(firestoreProvider));
});

// ── Leitura dos docs ────────────────────────────────────────────────────

String _str(Object? v) => v is String ? v.trim() : '';

String? _strOrNull(Object? v) {
  final s = _str(v);
  return s.isEmpty ? null : s;
}

DateTime? _date(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  if (v is String && v.trim().isNotEmpty) return DateTime.tryParse(v.trim());
  return null;
}

int? _rating(Object? v) {
  if (v is! num || !v.isFinite || v != v.roundToDouble()) return null;
  final n = v.toInt();
  return n >= 1 && n <= 5 ? n : null;
}

List<Map<String, dynamic>> _maps(Object? v) => v is List
    ? [
        for (final item in v)
          if (item is Map) Map<String, dynamic>.from(item),
      ]
    : const [];

List<StoreReviewTag> _tags(Object? v) {
  final raw = v is List ? v.toSet() : const <Object?>{};
  return [
    for (final tag in StoreReviewTag.values)
      if (raw.contains(tag.id)) tag,
  ];
}

/// `storeOrderReviews/{orderId}`. Item sem produto ou sem nota válida fica
/// de fora; doc sem item nenhum ainda vale (o pedido conta como avaliado).
StoreOrderReview? storeOrderReviewFromMap(
  String id,
  Map<String, dynamic>? data,
) {
  if (data == null) return null;
  final pickup = data['pickup'] is Map
      ? Map<String, dynamic>.from(data['pickup'] as Map)
      : null;
  final pickupRating = _rating(pickup?['rating']);
  return StoreOrderReview(
    orderId: _strOrNull(data['orderId']) ?? id,
    number: _str(data['number']),
    anonymous: data['anonymous'] == true,
    items: [
      for (final i in _maps(data['items']))
        if (_str(i['productId']).isNotEmpty && _rating(i['rating']) != null)
          StoreOrderReviewItem(
            productId: _str(i['productId']),
            skuId: _str(i['skuId']),
            name: _str(i['name']),
            variantLabel: _str(i['variantLabel']),
            imageUrl: _strOrNull(i['imageUrl']),
            sizeValueId: _strOrNull(i['sizeValueId']),
            rating: _rating(i['rating'])!,
            tags: _tags(i['tags']),
            fit: StoreReviewFit.from(i['fit']),
            comment: _str(i['comment']),
            photos: [
              for (final p in _maps(i['photos']))
                if (_str(p['path']).isNotEmpty && _str(p['url']).isNotEmpty)
                  StoreReviewPhoto(
                    path: _str(p['path']),
                    publicPath: _str(p['publicPath']),
                    url: _str(p['url']),
                  ),
            ],
            hidden: i['hiddenAt'] != null,
          ),
    ],
    pickup: pickupRating == null
        ? null
        : StoreOrderReviewPickup(
            placeName: _str(pickup?['placeName']),
            rating: pickupRating,
          ),
    createdAt: _date(data['createdAt']),
    updatedAt: _date(data['updatedAt']),
    editableUntil: _date(data['editableUntil']),
  );
}

/// `storeShowcase/{productId}/reviews/{id}`. Sem nota válida é descartada.
StorePublicReview? storePublicReviewFromMap(
  String id,
  Map<String, dynamic>? data,
) {
  if (data == null) return null;
  final rating = _rating(data['rating']);
  if (rating == null) return null;
  return StorePublicReview(
    id: id,
    rating: rating,
    tags: _tags(data['tags']),
    fit: StoreReviewFit.from(data['fit']),
    comment: _str(data['comment']),
    photos: [
      if (data['photos'] is List)
        for (final p in data['photos'] as List)
          if (_str(p).isNotEmpty) _str(p),
    ],
    variantLabel: _str(data['variantLabel']),
    sizeValueId: _strOrNull(data['sizeValueId']),
    authorName: _strOrNull(data['authorName']) ?? 'Atleta NexaGO',
    authorInitials: _strOrNull(data['authorInitials']) ?? '··',
    createdAt: _date(data['createdAt']),
    updatedAt: _date(data['updatedAt']),
  );
}
