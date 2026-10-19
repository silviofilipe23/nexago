import 'dart:typed_data';

import 'store_customize_service.dart';
import 'store_review_models.dart';

/// Leitura das avaliações: o doc privado do pedido (só o dono) e o espelho
/// público do produto.
abstract interface class StoreReviewRepository {
  /// `storeOrderReviews` do atleta (`uid == [uid]`), por `orderId`.
  Stream<Map<String, StoreOrderReview>> watchMyOrderReviews(String uid);

  /// Um doc; `null` = pedido ainda sem avaliação.
  Stream<StoreOrderReview?> watchOrderReview(String orderId);

  /// `storeShowcase/{productId}/reviews`, as 100 mais recentes.
  Stream<List<StorePublicReview>> watchProductReviews(String productId);
}

/// A callable `submitStoreOrderReview` e o envio das fotos.
abstract interface class StoreReviewService {
  /// Publica (ou edita) a avaliação do pedido inteiro. Erro →
  /// [StoreReviewException] com a mensagem pronta.
  Future<StoreReviewSubmitResult> submit(StoreReviewSubmission submission);

  /// Sobe a foto em `store/review-uploads/{uid}/{id}.{ext}` e devolve o
  /// caminho. [onProgress] vai de 0 a 1.
  Future<String> uploadPhoto({
    required String uid,
    required Uint8List bytes,
    required String contentType,
    required void Function(double progress) onProgress,
  });
}

/// Galeria ou câmera, já reduzida (~1600 px) e em JPEG quando dá (HEIC do
/// iOS vira JPEG). `null` = o atleta desistiu.
abstract interface class StoreReviewPhotoPicker {
  Future<StorePickedImage?> pick(StoreImageSource source);
}
