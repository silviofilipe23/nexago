import 'dart:typed_data';

import 'store_customize_rules.dart';

/// O que `checkStoreCustomName` respondeu: passou ou o problema.
class StoreNameCheck {
  const StoreNameCheck.ok() : problem = null;
  const StoreNameCheck.problem(StoreNameProblem this.problem);

  final StoreNameProblem? problem;

  bool get ok => problem == null;
}

/// O nome escolhido, como a callable recebe.
class StoreCustomNameChoice {
  const StoreCustomNameChoice({
    required this.text,
    required this.fontId,
    required this.color,
  });

  final String text;
  final String fontId;
  final String color;

  Map<String, Object> toMap() => {
        'text': text,
        'fontId': fontId,
        'color': color,
      };
}

/// A imagem já enviada ao Storage, na área e na posição escolhidas.
class StoreCustomImageChoice {
  const StoreCustomImageChoice({
    required this.path,
    required this.areaId,
    required this.transform,
  });

  final String path;
  final String areaId;
  final StoreImageTransform transform;

  Map<String, Object> toMap() => {
        'path': path,
        'areaId': areaId,
        'transform': transform.toMap(),
      };
}

/// Entrada de `addStoreCustomItemToCart`.
class StoreCustomCartRequest {
  const StoreCustomCartRequest({
    required this.productId,
    required this.skuId,
    this.qty = 1,
    this.name,
    this.image,
  });

  final String productId;
  final String skuId;
  final int qty;
  final StoreCustomNameChoice? name;
  final StoreCustomImageChoice? image;

  Map<String, Object> toMap() => {
        'productId': productId,
        'skuId': skuId,
        'qty': qty,
        if (name != null) 'name': name!.toMap(),
        if (image != null) 'image': image!.toMap(),
      };
}

/// Saída de `addStoreCustomItemToCart`.
class StoreCustomCartResult {
  const StoreCustomCartResult({
    required this.lineId,
    required this.extraPriceCents,
    required this.unitPriceCents,
    this.quality,
  });

  final String lineId;
  final int extraPriceCents;
  final int unitPriceCents;

  /// `null` sem imagem.
  final StoreImageQuality? quality;
}

/// Erro da callable com a mensagem pronta em português (o `HttpsError` do
/// servidor) e o código (`invalid-argument`, `unauthenticated`…).
class StoreCustomizeException implements Exception {
  const StoreCustomizeException(this.message, {this.code = ''});

  final String message;
  final String code;

  @override
  String toString() => message;
}

/// De onde vem a imagem (folha Fotos · Arquivos · Câmera).
enum StoreImageSource { photos, files, camera }

/// Arquivo escolhido no aparelho, ainda sem conferência.
class StorePickedImage {
  const StorePickedImage({required this.bytes, required this.fileName});

  final Uint8List bytes;
  final String fileName;
}

/// Abre a galeria, os arquivos ou a câmera. `null` = o atleta desistiu.
abstract interface class StoreCustomImagePicker {
  Future<StorePickedImage?> pick(
    StoreImageSource source, {
    required List<String> formats,
  });
}

/// As duas callables da personalização e o envio da imagem do atleta.
abstract interface class StoreCustomizeService {
  /// Nome no blur do campo (a lista de bloqueio não sai do servidor).
  Future<StoreNameCheck> checkName({
    required String productId,
    required String text,
  });

  /// Revalida tudo no servidor e grava a linha personalizada no carrinho.
  /// Erro → [StoreCustomizeException].
  Future<StoreCustomCartResult> addToCart(StoreCustomCartRequest request);

  /// Sobe a imagem em `store/custom-uploads/{uid}/{id}.{format}` e devolve o
  /// caminho. [onProgress] vai de 0 a 1.
  Future<String> uploadImage({
    required String uid,
    required Uint8List bytes,
    required String format,
    required void Function(double progress) onProgress,
  });
}
