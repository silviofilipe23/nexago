import '../../../core/formatting/app_currency_format.dart';

/// Textos da vitrine da Loja (tela 01) e da página do produto (tela 02).
abstract final class StoreCopy {
  StoreCopy._();

  static const pageTitle = 'Loja';
  static const back = 'Voltar';
  static const search = 'Buscar';
  static const cart = 'Carrinho';
  static const allCategories = 'Tudo';
  static const filter = 'Filtrar';

  static String filterWithCount(int count) =>
      count > 0 ? '$filter · $count' : filter;

  static String cartTooltip(int units) =>
      units > 0 ? '$cart, $units ${units == 1 ? 'item' : 'itens'}' : cart;

  // Arena de retirada
  static const pickupPrefix = 'Retire grátis na ';
  static const pickupChange = 'Trocar';
  static const pickupEmpty = 'Escolha uma arena pra retirar grátis';
  static const pickupChoose = 'Escolher';
  static const pickupSheetTitle = 'Onde você vai retirar?';

  static String pickupSheetSubtitle(int? readyHours) => readyHours != null
      ? 'Retirada grátis, pronta em até ${readyHours}h.'
      : 'Retirada grátis na arena que você escolher.';

  static const pickupSaveError = 'Não deu pra salvar a arena. Tente de novo.';

  // Preço
  static const fromPrefix = 'a partir de ';
  static const pixSuffix = ' no Pix';

  static String price(int cents) => formatBRLFromCents(cents);

  // Quick add
  static const added = 'Adicionado';
  static const seeCart = 'Ver carrinho';
  static const cartFull = 'Seu carrinho já tem 30 itens diferentes.';
  static const addError = 'Não deu pra adicionar agora. Confira a conexão.';
  static const notifyMe = 'Avise-me';
  static const waitlistSoon = 'Lista de espera em breve';
  static const addTooltip = 'Adicionar ao carrinho';
  static const variantAdd = 'Adicionar';
  static const variantPick = 'Escolha as opções';
  static const variantUnavailable = 'Indisponível';

  // Estados
  static const errorTitle = 'Não deu pra carregar a loja';
  static const errorMessage = 'Confira sua conexão e tente de novo.';
  static const retry = 'Tentar de novo';
  static const offline = 'Sem conexão · mostrando a última vitrine salva';
  static const emptyFilters = 'Nada por aqui com esses filtros';
  static const clearFilters = 'Limpar filtros';
  static const emptyCatalog = 'A vitrine está sendo montada';
  static const emptyCatalogHint = 'Volte em breve pra ver as novidades.';

  static String searchNotFound(String term) => 'Não achamos "${term.trim()}"';
  static const searchNotFoundHint = 'Que tal os mais vendidos?';
  static const clearSearch = 'Limpar busca';

  // Filtrar
  static const filterSheetTitle = 'Filtrar';
  static const filterSort = 'ORDENAR POR';
  static const filterPrice = 'FAIXA DE PREÇO';
  static const filterMore = 'MAIS FILTROS';
  static const filterMyArena = 'Só com retirada na minha arena';
  static const filterMyArenaNoArena = 'Escolha uma arena de retirada antes.';
  static const filterOnSale = 'Em promoção';
  static const filterClear = 'Limpar';

  static String filterApply(int count) => switch (count) {
        0 => 'Nenhum produto',
        1 => 'Ver 1 produto',
        _ => 'Ver $count produtos',
      };

  // Busca
  static const searchHint = 'Buscar bola, viseira, rede…';
  static const recentSearches = 'BUSCAS RECENTES';
  static const suggestionsProducts = 'PRODUTOS';
  static const suggestionsCategories = 'CATEGORIAS';
  static const noSuggestions = 'Nada com esse nome. Aperte buscar pra ver tudo.';

  static String categorySuggestion(String label) => 'Ver tudo em $label';

  // Página do produto (tela 02)
  static const favoriteAdd = 'Favoritar';
  static const favoriteRemove = 'Tirar dos favoritos';
  static const favoriteError = 'Não deu pra salvar o favorito. Tente de novo.';
  static const share = 'Compartilhar';
  static const soldOutBadge = 'Esgotado';
  static const customizeTitle = 'Personalize';
  static const customizeButton = 'Personalizar';
  static const customizeSoon = 'A personalização chega em breve';
  static const receiveTitle = 'COMO RECEBER';
  static const receiveSheetTitle = 'Como receber';
  static const receiveFree = 'Grátis';
  static const receiveAtCheckout = 'No checkout';
  static const receiveChangeArena = 'Trocar arena';
  static const receiveChooseArena = 'Escolher arena';
  static const receiveNoArena = 'Escolha uma arena pra retirar grátis';
  static const detailsTitle = 'DETALHES';
  static const readMore = 'Ler mais';
  static const readLess = 'Ler menos';
  static const relatedTitle = 'Combina com';
  static const qtyLess = 'Diminuir quantidade';
  static const qtyMore = 'Aumentar quantidade';
  static const addedCta = 'Adicionado';
  static const notifyMeCta = 'Avise-me quando chegar';
  static const offlineCta = 'Sem conexão';
  static const addedToCart = 'Adicionado ao carrinho';
  static const see = 'Ver';
  static const comboUnavailable = 'Essa combinação esgotou · escolha outra';
  static const unavailableTitle = 'Esse produto não está mais disponível';
  static const unavailableHint = 'Que tal os mais vendidos da loja?';
  static const backToStore = 'Ver a loja';

  static String addCta(int totalCents) => 'Adicionar · ${price(totalCents)}';

  static String customizeFrom(int cents) =>
      '+ personalização a partir de ${price(cents)}';

  /// "Feito sob demanda · pronto em 5 dias úteis · troca só por defeito".
  static String madeToOrder(int leadDays, {required bool defectOnlyReturns}) =>
      [
        'Feito sob demanda',
        if (leadDays > 0)
          'pronto em $leadDays ${leadDays == 1 ? 'dia útil' : 'dias úteis'}',
        if (defectOnlyReturns) 'troca só por defeito',
      ].join(' · ');

  static String pickupAt(String arena) => 'Retirar na $arena';
  static String pickupSummary(String day) => 'Retire $day · grátis';

  static String deliveryFrom(int? cents) => switch (cents) {
        null => 'Entrega · frete no checkout',
        0 => 'Entrega grátis',
        _ => 'Entrega a partir de ${price(cents)}',
      };

  static String orDeliveryFrom(int? cents) => switch (cents) {
        null => 'ou entrega',
        0 => 'ou entrega grátis',
        _ => 'ou entrega a partir de ${price(cents)}',
      };

  static String freeShippingAbove(int cents) =>
      'Frete grátis a partir de ${price(cents)}';

  /// A linha já tem o máximo que o saldo deixa comprar.
  static String cartLineAtMax(int max) =>
      'Você já tem $max no carrinho — é o máximo desse item agora.';

  /// Só parte coube: a linha foi até o máximo.
  static String cartLineCapped(int max) =>
      'Adicionado · seu carrinho ficou com $max, o máximo desse item.';

  static String ratingCount(int count) => '($count)';

  // Próxima etapa
  static const comingSoonTitle = 'Esta parte da Loja chega na próxima etapa';
  static const comingSoonBody =
      'Por enquanto, dá pra explorar a vitrine e montar o carrinho.';
  static const comingSoonBack = 'Voltar pra vitrine';

  // Home
  static const homeEntryTitle = 'Loja nexaGO';
  static const homeEntrySubtitle =
      'Bolas, roupas e acessórios · retire grátis na arena';
}
