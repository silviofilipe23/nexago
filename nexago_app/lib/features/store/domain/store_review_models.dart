/// Loja · Avaliação da compra (app 08b/08c) e avaliações na página do
/// produto (02).
///
/// Espelham `docs/business-rules/loja-avaliacoes.md` e
/// `functions/src/store-reviews.ts`: o atleta lê o doc privado do pedido
/// (`storeOrderReviews/{orderId}`) e o espelho público
/// (`storeShowcase/{productId}/reviews`); só a callable
/// `submitStoreOrderReview` grava.
library;

import 'dart:typed_data';

/// Etiquetas do "O que você mais gostou", na ordem do formulário
/// (`REVIEW_TAGS` do servidor). Web e app guardam os rótulos.
enum StoreReviewTag {
  qualidade('qualidade', 'Qualidade'),
  conforto('conforto', 'Conforto'),
  tamanho('tamanho', 'Tamanho certo'),
  foto('foto', 'Igual à foto'),
  custo('custo', 'Custo-benefício'),
  durabilidade('durabilidade', 'Durabilidade');

  const StoreReviewTag(this.id, this.label);

  final String id;
  final String label;

  static StoreReviewTag? from(Object? raw) {
    for (final tag in values) {
      if (tag.id == raw) return tag;
    }
    return null;
  }
}

/// "Como ficou o tamanho?" (só produto com eixo Tamanho).
enum StoreReviewFit {
  pequeno('pequeno', 'Pequeno', 'Veste pequeno'),
  certo('certo', 'Certo', 'Tamanho certo'),
  grande('grande', 'Grande', 'Veste grande');

  const StoreReviewFit(this.id, this.formLabel, this.chipLabel);

  final String id;

  /// Opção do formulário.
  final String formLabel;

  /// Etiqueta do card público.
  final String chipLabel;

  static StoreReviewFit? from(Object? raw) {
    for (final fit in values) {
      if (fit.id == raw) return fit;
    }
    return null;
  }
}

/// Rótulo da nota (1 a 5); fora disso, vazio.
String storeReviewRatingLabel(int? rating) => switch (rating) {
  1 => 'Ruim',
  2 => 'Regular',
  3 => 'Bom',
  4 => 'Muito bom',
  5 => 'Excelente',
  _ => '',
};

/// Limites do servidor (`MAX_REVIEW_*`, `REVIEW_EDIT_DAYS`).
const int kStoreReviewMaxComment = 500;
const int kStoreReviewMaxPhotos = 3;
const int kStoreReviewMaxPhotoBytes = 10 * 1024 * 1024;
const int kStoreReviewEditDays = 30;

/// A nota média só aparece a partir daqui (o `showRating` da vitrine).
const int kStoreReviewMinForAverage = 3;

/// O caimento só aparece com pelo menos tantas respostas de `fit`.
const int kStoreReviewMinFitAnswers = 3;

/// Foto da avaliação no doc privado: [path] é o upload do atleta (a
/// identidade da foto na edição — é o que volta na callable); [url] é a
/// cópia pública que a tela mostra.
class StoreReviewPhoto {
  const StoreReviewPhoto({
    required this.path,
    this.publicPath = '',
    required this.url,
  });

  final String path;
  final String publicPath;
  final String url;
}

/// Um produto avaliado, no doc privado do pedido.
class StoreOrderReviewItem {
  const StoreOrderReviewItem({
    required this.productId,
    this.skuId = '',
    this.name = '',
    this.variantLabel = '',
    this.imageUrl,
    this.sizeValueId,
    required this.rating,
    this.tags = const [],
    this.fit,
    this.comment = '',
    this.photos = const [],
    this.hidden = false,
  });

  final String productId;
  final String skuId;
  final String name;
  final String variantLabel;
  final String? imageUrl;
  final String? sizeValueId;
  final int rating;
  final List<StoreReviewTag> tags;
  final StoreReviewFit? fit;
  final String comment;
  final List<StoreReviewPhoto> photos;

  /// Escondida pela moderação (`hiddenAt`): fora da página do produto.
  final bool hidden;
}

/// A retirada avaliada (pedido de arena).
class StoreOrderReviewPickup {
  const StoreOrderReviewPickup({this.placeName = '', required this.rating});

  final String placeName;
  final int rating;
}

/// `storeOrderReviews/{orderId}` (só o dono lê).
class StoreOrderReview {
  const StoreOrderReview({
    required this.orderId,
    this.number = '',
    this.anonymous = false,
    this.items = const [],
    this.pickup,
    this.createdAt,
    this.updatedAt,
    this.editableUntil,
  });

  final String orderId;
  final String number;
  final bool anonymous;
  final List<StoreOrderReviewItem> items;
  final StoreOrderReviewPickup? pickup;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Fim do prazo de edição (30 dias da primeira publicação).
  final DateTime? editableUntil;

  StoreOrderReviewItem? itemOf(String productId) {
    for (final item in items) {
      if (item.productId == productId) return item;
    }
    return null;
  }
}

/// `storeShowcase/{productId}/reviews/{id}`: só o que a página mostra.
class StorePublicReview {
  const StorePublicReview({
    required this.id,
    required this.rating,
    this.tags = const [],
    this.fit,
    this.comment = '',
    this.photos = const [],
    this.variantLabel = '',
    this.sizeValueId,
    this.authorName = 'Atleta NexaGO',
    this.authorInitials = '··',
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final int rating;
  final List<StoreReviewTag> tags;
  final StoreReviewFit? fit;
  final String comment;

  /// Links públicos das fotos.
  final List<String> photos;
  final String variantLabel;
  final String? sizeValueId;
  final String authorName;
  final String authorInitials;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

/// Um item do `submitStoreOrderReview`.
class StoreReviewItemInput {
  const StoreReviewItemInput({
    required this.productId,
    required this.rating,
    this.tags = const [],
    this.fit,
    this.comment = '',
    this.photos = const [],
  });

  final String productId;
  final int rating;
  final List<StoreReviewTag> tags;
  final StoreReviewFit? fit;
  final String comment;

  /// Caminhos no Storage (`store/review-uploads/{uid}/…`).
  final List<String> photos;

  Map<String, Object?> toMap() => {
    'productId': productId,
    'rating': rating,
    'tags': [for (final t in tags) t.id],
    'fit': fit?.id,
    'comment': comment,
    'photos': photos,
  };
}

/// O pedido inteiro da callable — editar regrava tudo (o que vier é o
/// estado novo).
class StoreReviewSubmission {
  const StoreReviewSubmission({
    required this.orderId,
    required this.anonymous,
    required this.items,
    this.pickupRating,
  });

  final String orderId;
  final bool anonymous;
  final List<StoreReviewItemInput> items;
  final int? pickupRating;

  Map<String, Object?> toMap() => {
    'orderId': orderId,
    'anonymous': anonymous,
    'items': [for (final i in items) i.toMap()],
    'pickupRating': pickupRating,
  };
}

/// O que a callable devolve.
class StoreReviewSubmitResult {
  const StoreReviewSubmitResult({required this.created, this.editableUntil});

  /// Primeira publicação (não edição).
  final bool created;
  final DateTime? editableUntil;
}

/// Erro da avaliação com a mensagem pronta em português.
class StoreReviewException implements Exception {
  const StoreReviewException(this.message, {this.code = ''});

  final String message;
  final String code;

  @override
  String toString() => message;
}

/// Foto no formulário: já no Storage ([path]) ou subindo ([uploading]).
/// [url] é a foto que já estava publicada (edição); [bytes], a prévia local.
class StoreReviewPhotoDraft {
  const StoreReviewPhotoDraft({
    required this.id,
    this.path,
    this.url,
    this.bytes,
    this.uploading = false,
    this.progress = 0,
  });

  /// Chave local (estável enquanto a foto sobe).
  final String id;
  final String? path;
  final String? url;
  final Uint8List? bytes;
  final bool uploading;
  final double progress;

  bool get ready => !uploading && (path ?? '').isNotEmpty;

  StoreReviewPhotoDraft copyWith({
    String? path,
    bool? uploading,
    double? progress,
  }) => StoreReviewPhotoDraft(
    id: id,
    path: path ?? this.path,
    url: url,
    bytes: bytes,
    uploading: uploading ?? this.uploading,
    progress: progress ?? this.progress,
  );
}

/// Um produto no formulário 08b. [sized] = produto com eixo Tamanho (ganha a
/// pergunta do caimento e perde a etiqueta "Tamanho certo").
class StoreReviewItemDraft {
  const StoreReviewItemDraft({
    required this.productId,
    this.sized = false,
    this.rating,
    this.tags = const {},
    this.fit,
    this.comment = '',
    this.photos = const [],
  });

  final String productId;
  final bool sized;
  final int? rating;
  final Set<StoreReviewTag> tags;
  final StoreReviewFit? fit;
  final String comment;
  final List<StoreReviewPhotoDraft> photos;

  bool get uploading => photos.any((p) => p.uploading);

  StoreReviewItemDraft copyWith({
    int? rating,
    Set<StoreReviewTag>? tags,
    StoreReviewFit? fit,
    bool clearFit = false,
    String? comment,
    List<StoreReviewPhotoDraft>? photos,
  }) => StoreReviewItemDraft(
    productId: productId,
    sized: sized,
    rating: rating ?? this.rating,
    tags: tags ?? this.tags,
    fit: clearFit ? null : (fit ?? this.fit),
    comment: comment ?? this.comment,
    photos: photos ?? this.photos,
  );
}
