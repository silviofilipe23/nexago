import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/store_review_models.dart';
import '../infrastructure/firebase_store_review_service.dart';
import '../infrastructure/firestore_store_review_repository.dart';
import 'store_providers.dart';

export '../infrastructure/device_store_review_photo_picker.dart'
    show storeReviewPhotoPickerProvider;
export '../infrastructure/firebase_store_review_service.dart'
    show storeReviewServiceProvider;
export '../infrastructure/firestore_store_review_repository.dart'
    show storeReviewRepositoryProvider;

/// As avaliações do atleta por pedido (Meus pedidos: "Avaliar" / "Editar" /
/// "Avaliado"); deslogado = nenhuma.
final storeMyOrderReviewsProvider =
    StreamProvider.autoDispose<Map<String, StoreOrderReview>>((ref) {
      final uid = ref.watch(storeUidProvider);
      if (uid.isEmpty) return Stream.value(const <String, StoreOrderReview>{});
      return ref.watch(storeReviewRepositoryProvider).watchMyOrderReviews(uid);
    });

/// A avaliação de um pedido (chave `String` — `family` com lista vira loop);
/// `null` = ainda não avaliado.
final storeOrderReviewProvider = StreamProvider.autoDispose
    .family<StoreOrderReview?, String>((ref, orderId) {
      if (ref.watch(storeUidProvider).isEmpty || orderId.trim().isEmpty) {
        return Stream.value(null);
      }
      return ref
          .watch(storeReviewRepositoryProvider)
          .watchOrderReview(orderId.trim());
    });

/// As avaliações publicadas de um produto (as 100 mais recentes). Erro (rule
/// ainda não publicada) = a seção some.
final storeProductReviewsProvider = StreamProvider.autoDispose
    .family<List<StorePublicReview>, String>((ref, productId) {
      if (productId.trim().isEmpty) {
        return Stream.value(const <StorePublicReview>[]);
      }
      return ref
          .watch(storeReviewRepositoryProvider)
          .watchProductReviews(productId.trim());
    });

/// Publicar a avaliação e subir as fotos (precisa de sessão).
class StoreReviewActions {
  StoreReviewActions(this._ref);

  final Ref _ref;

  String _uid() {
    final uid = _ref.read(storeUidProvider);
    if (uid.isEmpty) {
      throw const StoreReviewException(
        'Sua sessão expirou. Entre de novo para continuar.',
        code: 'unauthenticated',
      );
    }
    return uid;
  }

  Future<StoreReviewSubmitResult> submit(StoreReviewSubmission submission) {
    _uid();
    return _ref.read(storeReviewServiceProvider).submit(submission);
  }

  Future<String> uploadPhoto({
    required Uint8List bytes,
    required String contentType,
    required void Function(double progress) onProgress,
  }) => _ref
      .read(storeReviewServiceProvider)
      .uploadPhoto(
        uid: _uid(),
        bytes: bytes,
        contentType: contentType,
        onProgress: onProgress,
      );
}

/// Sem autoDispose: as ações terminam depois de um `await` (ver
/// `storeActionsProvider`).
final storeReviewActionsProvider = Provider<StoreReviewActions>(
  StoreReviewActions.new,
);
