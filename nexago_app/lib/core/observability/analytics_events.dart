/// Nomes de eventos de funil e construção de parâmetros — a parte pura e
/// testável do analytics (o serviço é só a cola sobre o FirebaseAnalytics).
abstract final class AnalyticsEvents {
  AnalyticsEvents._();

  static const onboardingComplete = 'onboarding_complete';
  static const tournamentRegistrationStart = 'tournament_registration_start';
  static const tournamentRegistrationPaymentInitiated =
      'tournament_registration_payment_initiated';
  static const tournamentRegistrationConfirmed =
      'tournament_registration_confirmed';

  // Funil do Bora Jogar (match finder):
  // builder aberto → convite enviado → aceito → check-in → avaliação.
  static const friendlyMatchBuilderOpened = 'friendly_match_builder_opened';
  static const friendlyMatchInviteSent = 'friendly_match_invite_sent';
  static const friendlyMatchInviteAccepted = 'friendly_match_invite_accepted';
  static const friendlyMatchCheckedIn = 'friendly_match_checked_in';
  static const friendlyMatchReviewSubmitted = 'friendly_match_review_submitted';

  // Loja · vitrine (tela 01). Mesmos nomes do portal web
  // (`docs/business-rules/loja-vitrine.md`).
  static const storeShowcaseView = 'loja_vitrine_view';
  static const storeBannerClick = 'loja_banner_click';
  static const storeCategorySelect = 'loja_categoria_select';
  static const storeSearch = 'loja_busca';
  static const storeProductClick = 'loja_produto_click';
  static const storeQuickAdd = 'loja_add_rapido';
  static const storeFavorite = 'loja_favoritar';
  static const storePickupArenaChange = 'loja_arena_trocar';
}

/// Parâmetros dos eventos da Loja, com os nomes do portal (`campanha_id`,
/// `categoria`, `termo`, `resultados`, `produto_id`, `posicao`, `on`,
/// `arena_id`). Texto vazio é descartado; booleano vira 1/0 (o
/// FirebaseAnalytics só aceita texto e número).
Map<String, Object> storeEventParams({
  String? campaignId,
  String? category,
  String? term,
  int? results,
  String? productId,
  int? position,
  bool? on,
  String? arenaId,
}) {
  String? clean(String? v) =>
      v != null && v.trim().isNotEmpty ? v.trim() : null;
  return {
    if (clean(campaignId) != null) 'campanha_id': clean(campaignId)!,
    if (clean(category) != null) 'categoria': clean(category)!,
    if (clean(term) != null) 'termo': clean(term)!,
    if (results != null) 'resultados': results,
    if (clean(productId) != null) 'produto_id': clean(productId)!,
    if (position != null) 'posicao': position,
    if (on != null) 'on': on ? 1 : 0,
    if (clean(arenaId) != null) 'arena_id': clean(arenaId)!,
  };
}

/// Monta os parâmetros de um evento de inscrição, descartando campos vazios
/// (o FirebaseAnalytics rejeita valores nulos e chaves sem valor útil).
Map<String, Object> tournamentRegistrationParams({
  required String tournamentId,
  required String categoryId,
  String? amountType,
}) {
  return {
    if (tournamentId.trim().isNotEmpty) 'tournament_id': tournamentId.trim(),
    if (categoryId.trim().isNotEmpty) 'category_id': categoryId.trim(),
    if (amountType != null && amountType.trim().isNotEmpty)
      'amount_type': amountType.trim(),
  };
}

/// Parâmetros do funil do Bora Jogar, descartando campos vazios.
Map<String, Object> friendlyMatchParams({
  String? source,
  String? objective,
  String? sport,
  bool? hasArena,
  bool? wasCounter,
  int? stars,
}) {
  return {
    if (source != null && source.trim().isNotEmpty) 'source': source.trim(),
    if (objective != null && objective.trim().isNotEmpty)
      'objective': objective.trim(),
    if (sport != null && sport.trim().isNotEmpty) 'sport': sport.trim(),
    if (hasArena != null) 'has_arena': hasArena ? 1 : 0,
    if (wasCounter != null) 'was_counter': wasCounter ? 1 : 0,
    if (stars != null) 'stars': stars,
  };
}
