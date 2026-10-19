import 'dart:async';
import 'dart:typed_data';

import 'package:nexago_app/features/store/domain/store_customize_service.dart';
import 'package:nexago_app/features/store/domain/store_review_models.dart';
import 'package:nexago_app/features/store/domain/store_review_service.dart';

/// Avaliações em memória: nada de Firestore, Functions nem Storage no teste.

class FakeStoreReviewRepository implements StoreReviewRepository {
  FakeStoreReviewRepository({
    Map<String, StoreOrderReview> reviews = const {},
    Map<String, List<StorePublicReview>> productReviews = const {},
    this.productError,
  })  : reviews = Map.of(reviews),
        productReviews = Map.of(productReviews);

  Map<String, StoreOrderReview> reviews;
  Map<String, List<StorePublicReview>> productReviews;

  /// Simula a rule ainda não publicada (`permission-denied`).
  Object? productError;

  final _mine = StreamController<Map<String, StoreOrderReview>>.broadcast();
  final Map<String, StreamController<StoreOrderReview?>> _one = {};

  StreamController<StoreOrderReview?> _of(String id) =>
      _one.putIfAbsent(id, StreamController<StoreOrderReview?>.broadcast);

  /// Grava/troca a avaliação de um pedido e avisa os listeners.
  void setReview(StoreOrderReview review) {
    reviews[review.orderId] = review;
    _mine.add(Map.of(reviews));
    _of(review.orderId).add(review);
  }

  @override
  Stream<Map<String, StoreOrderReview>> watchMyOrderReviews(String uid) async* {
    yield Map.of(reviews);
    yield* _mine.stream;
  }

  @override
  Stream<StoreOrderReview?> watchOrderReview(String orderId) async* {
    yield reviews[orderId];
    yield* _of(orderId).stream;
  }

  @override
  Stream<List<StorePublicReview>> watchProductReviews(String productId) {
    final error = productError;
    if (error != null) return Stream.error(error);
    return Stream.value(List.of(productReviews[productId] ?? const []));
  }
}

class FakeStoreReviewService implements StoreReviewService {
  final List<StoreReviewSubmission> submitted = [];
  final List<(String, String, int)> uploads = [];

  Future<StoreReviewSubmitResult> Function(StoreReviewSubmission s) submitImpl =
      (s) async => StoreReviewSubmitResult(
            created: true,
            editableUntil: DateTime.utc(2026, 11, 16, 20),
          );

  /// Segura o envio da foto até completar (teste do "subindo").
  Completer<void>? uploadGate;

  @override
  Future<StoreReviewSubmitResult> submit(StoreReviewSubmission submission) {
    submitted.add(submission);
    return submitImpl(submission);
  }

  @override
  Future<String> uploadPhoto({
    required String uid,
    required Uint8List bytes,
    required String contentType,
    required void Function(double progress) onProgress,
  }) async {
    uploads.add((uid, contentType, bytes.length));
    onProgress(0.5);
    await uploadGate?.future;
    return 'store/review-uploads/$uid/foto${uploads.length}.jpg';
  }
}

/// JPEG de mentira (só a assinatura importa para a conferência).
final Uint8List kFakeJpeg =
    Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, ...List.filled(60, 0)]);

class FakeReviewPhotoPicker implements StoreReviewPhotoPicker {
  FakeReviewPhotoPicker({Uint8List? bytes}) : bytes = bytes ?? kFakeJpeg;

  Uint8List? bytes;
  final List<StoreImageSource> picks = [];

  @override
  Future<StorePickedImage?> pick(StoreImageSource source) async {
    picks.add(source);
    final b = bytes;
    return b == null ? null : StorePickedImage(bytes: b, fileName: 'foto.jpg');
  }
}
