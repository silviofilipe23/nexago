import '../../../core/formatting/app_currency_format.dart';

/// Textos da vitrine da Loja (tela 01).
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
