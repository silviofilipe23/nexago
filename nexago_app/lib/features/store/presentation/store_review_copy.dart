/// Textos da avaliação da compra (app 08b/08c) e da seção "Avaliações" do
/// produto (02). Rótulos de nota, etiquetas, caimento e filtros vêm das regras
/// (`store_review_models.dart` / `store_review_rules.dart`), iguais aos do
/// portal.
abstract final class StoreReviewCopy {
  StoreReviewCopy._();

  // Meus pedidos / pedido
  static const rate = 'Avaliar';
  static const rateOrder = 'Avaliar compra';
  static const editReview = 'Editar avaliação';
  static const reviewed = 'Avaliado';

  // 08b
  static const title = 'Avaliar compra';
  static String stepSubtitle(String number, int index, int total) =>
      '${_hash(number)} · item $index de $total';
  static String pickupSubtitle(String number) => '${_hash(number)} · retirada';
  static const productQuestion = 'O que achou do produto?';
  static const tagsTitle = 'O QUE VOCÊ MAIS GOSTOU';
  static const fitTitle = 'COMO FICOU O TAMANHO?';
  static const commentTitle = 'COMENTÁRIO · OPCIONAL';
  static const commentHint =
      'Conte como foi usar: tecido, conforto, se veste bem…';
  static String commentCount(int n, int max) => '$n/$max';
  static const photosTitle = 'FOTOS · OPCIONAL';
  static const addPhoto = 'Foto';
  static const addPhotoSheet = 'Adicionar foto';
  static const sourcePhotos = 'Fotos';
  static const sourceCamera = 'Câmera';
  static const removePhoto = 'Remover foto';
  static const anonymous = 'Publicar sem meu nome';
  static const skip = 'Pular';
  static const next = 'Próximo item';
  static const publish = 'Publicar avaliação';
  static const uploadingPhotos = 'Enviando fotos…';
  static String pickupTitle(String? placeName) {
    final place = (placeName ?? '').trim();
    return place.isEmpty ? 'Retirada na arena' : 'Retirada na $place';
  }

  static const pickupQuestion = 'Como foi pegar o pedido na recepção?';
  static const pickupStars = 'O que achou da retirada?';
  static const photoPickError = 'Não deu pra abrir a foto. Tente outra.';
  static const photoUploadError =
      'Não deu pra enviar a foto. Tente de novo em instantes.';
  static String starsLabel(int n) => n == 1 ? '1 estrela' : '$n estrelas';

  // Estados da tela 08b
  static const loadError = 'Não deu pra carregar o pedido';
  static const loadErrorBody = 'Confira a conexão e tente de novo.';
  static const retry = 'Tentar de novo';
  static const notFoundTitle = 'Não achamos esse pedido';
  static const notFoundBody = 'Confira em Meus pedidos.';
  static const notReviewableTitle = 'Ainda não dá pra avaliar';
  static const notReviewableBody =
      'Você avalia depois de retirar ou receber o pedido.';
  static const lockedTitle = 'Avaliação encerrada';
  static const lockedBody = 'O prazo pra editar essa avaliação acabou.';
  static const nothingToReview = 'Esse pedido não tem produtos pra avaliar.';
  static const myOrders = 'Meus pedidos';

  // 08c
  static const thanksTitle = 'Valeu pela avaliação!';
  static const updatedTitle = 'Avaliação atualizada';
  static String editUntil(String date) =>
      'Você pode editar em Meus pedidos até $date.';
  static const thanksBody = 'Ela já aparece na página do produto. A equipe '
      'NexaGO pode esconder avaliações fora das regras.';
  static String pickupRow(String? placeName) {
    final place = (placeName ?? '').trim();
    return place.isEmpty ? 'Retirada' : 'Retirada · $place';
  }

  static const editHint = 'Você pode editar em Meus pedidos por 30 dias.';
  static const backToStore = 'Voltar à loja';

  // 02 · Avaliações
  static const sectionTitle = 'Avaliações';
  static String seeAll(int n) => 'Ver todas ($n)';
  static const verified = 'Compra verificada';
  static String countAndRecommend(String count, int pct) =>
      '$count · $pct% recomendam';
  static const emptyTitle = 'Ainda sem avaliações';
  static const emptyBody =
      'Só quem comprou pela NexaGO avalia, em Meus pedidos, depois de '
      'retirar ou receber.';
  static const onlyBuyersNote =
      'Só quem comprou pela NexaGO pode avaliar. Você avalia em Meus pedidos '
      'depois de retirar ou receber.';
  static const fitTitleLabel = 'TAMANHO';
  static const fitSmall = 'Pequeno';
  static const fitLarge = 'Grande';
  static const noneWithFilter = 'Nenhuma avaliação com esse filtro.';
  static const sortTooltip = 'Ordenar avaliações';
  static const closePhoto = 'Fechar';
  static const reviewsLoadError = 'Não deu pra carregar as avaliações';

  static String _hash(String number) {
    final n = number.trim();
    if (n.isEmpty) return '';
    return n.startsWith('#') ? n : '#$n';
  }
}
