import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'analytics_events.dart';

/// Cola fina sobre o [FirebaseAnalytics] com os eventos de funil do app.
class AnalyticsService {
  AnalyticsService(this._analytics);

  final FirebaseAnalytics _analytics;

  Future<void> logLogin(String method) =>
      _analytics.logLogin(loginMethod: method);

  Future<void> logSignUp(String method) =>
      _analytics.logSignUp(signUpMethod: method);

  Future<void> logOnboardingComplete() =>
      _analytics.logEvent(name: AnalyticsEvents.onboardingComplete);

  Future<void> logTournamentRegistrationStart({
    required String tournamentId,
    required String categoryId,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.tournamentRegistrationStart,
        parameters: tournamentRegistrationParams(
          tournamentId: tournamentId,
          categoryId: categoryId,
        ),
      );

  Future<void> logTournamentRegistrationPaymentInitiated({
    required String tournamentId,
    required String categoryId,
    String? amountType,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.tournamentRegistrationPaymentInitiated,
        parameters: tournamentRegistrationParams(
          tournamentId: tournamentId,
          categoryId: categoryId,
          amountType: amountType,
        ),
      );

  Future<void> logTournamentRegistrationConfirmed({
    required String tournamentId,
    required String categoryId,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.tournamentRegistrationConfirmed,
        parameters: tournamentRegistrationParams(
          tournamentId: tournamentId,
          categoryId: categoryId,
        ),
      );

  // --- Funil do Bora Jogar (match finder) ---

  Future<void> logFriendlyMatchBuilderOpened({String? source}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchBuilderOpened,
        parameters: friendlyMatchParams(source: source),
      );

  Future<void> logFriendlyMatchInviteSent({
    required String objective,
    required String sport,
    required bool hasArena,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchInviteSent,
        parameters: friendlyMatchParams(
          objective: objective,
          sport: sport,
          hasArena: hasArena,
        ),
      );

  Future<void> logFriendlyMatchInviteAccepted({required bool wasCounter}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchInviteAccepted,
        parameters: friendlyMatchParams(wasCounter: wasCounter),
      );

  Future<void> logFriendlyMatchCheckedIn() =>
      _analytics.logEvent(name: AnalyticsEvents.friendlyMatchCheckedIn);

  Future<void> logFriendlyMatchReviewSubmitted({required int stars}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.friendlyMatchReviewSubmitted,
        parameters: friendlyMatchParams(stars: stars),
      );

  // --- Loja · vitrine (tela 01) ---

  Future<void> logStoreShowcaseView() =>
      _analytics.logEvent(name: AnalyticsEvents.storeShowcaseView);

  Future<void> logStoreBannerClick({required String campaignId}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeBannerClick,
        parameters: storeEventParams(campaignId: campaignId),
      );

  /// [category] `null` = chip "Tudo" (vai como `tudo`, igual ao portal).
  Future<void> logStoreCategorySelect({String? category}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCategorySelect,
        parameters: storeEventParams(category: category ?? 'tudo'),
      );

  Future<void> logStoreSearch({required String term, required int results}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeSearch,
        parameters: storeEventParams(term: term, results: results),
      );

  /// [position] começa em 1 (primeiro card da grade), como no portal.
  Future<void> logStoreProductClick({
    required String productId,
    required int position,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeProductClick,
        parameters: storeEventParams(productId: productId, position: position),
      );

  Future<void> logStoreQuickAdd({required String productId}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeQuickAdd,
        parameters: storeEventParams(productId: productId),
      );

  Future<void> logStoreFavorite({
    required String productId,
    required bool on,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeFavorite,
        parameters: storeEventParams(productId: productId, on: on),
      );

  Future<void> logStorePickupArenaChange({required String arenaId}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storePickupArenaChange,
        parameters: storeEventParams(arenaId: arenaId),
      );

  // --- Loja · produto (tela 02) ---

  /// [origin]: `vitrine`, `busca`, `relacionado`, `indisponivel` ou `link`
  /// (deep link / rota sem origem).
  Future<void> logStoreProductView({
    required String productId,
    required String origin,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeProductView,
        parameters: storeEventParams(productId: productId, origin: origin),
      );

  Future<void> logStorePhotoSwipe() =>
      _analytics.logEvent(name: AnalyticsEvents.storePhotoSwipe);

  /// Ids dos valores escolhidos: [color] do eixo de cor, [size] do último
  /// eixo de botões (tamanho, modelo…).
  Future<void> logStoreVariantSelect({String? color, String? size}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeVariantSelect,
        parameters: storeEventParams(color: color, size: size),
      );

  Future<void> logStoreNotifyMe({String? sku}) => _analytics.logEvent(
        name: AnalyticsEvents.storeNotifyMe,
        parameters: storeEventParams(sku: sku),
      );

  /// [priceCents] = preço unitário do SKU (com o adicional, na linha
  /// personalizada), em centavos. [customized] só vai na personalização
  /// (`personalizado: 1`).
  Future<void> logStoreAddToCart({
    required String sku,
    required int qty,
    required int priceCents,
    bool? customized,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeAddToCart,
        parameters: storeEventParams(
          sku: sku,
          qty: qty,
          priceCents: priceCents,
          customized: customized,
        ),
      );

  /// [type]: `retirada` ou o id da modalidade de entrega (página do
  /// produto); no carrinho, `arena`/`casa` com [screen] `checkout` (igual ao
  /// portal).
  Future<void> logStoreDeliverySelect({
    required String type,
    String? screen,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeDeliverySelect,
        parameters: storeEventParams(type: type, screen: screen),
      );

  // --- Loja · Personalizar (app 02b/02c) ---

  /// Ao abrir a tela de personalização (`canal: app`).
  Future<void> logStoreCustomizeOpen({required String productId}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCustomizeOpen,
        parameters: storeEventParams(productId: productId, channel: 'app'),
      );

  /// O atleta saiu do campo com um nome; [font] = id da fonte.
  Future<void> logStoreCustomizeName({required String font}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCustomizeName,
        parameters: storeEventParams(font: font),
      );

  /// Imagem enviada; [area] = id da área, [quality] = `good`/`warn`.
  Future<void> logStoreCustomizeImage({
    required String area,
    required String quality,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCustomizeImage,
        parameters: storeEventParams(area: area, quality: quality),
      );

  Future<void> logStoreRelatedClick({required String productId}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeRelatedClick,
        parameters: storeEventParams(productId: productId),
      );

  // --- Loja · Carrinho, checkout e pedidos (app 03–08) ---

  /// Carrinho aberto com [units] unidades.
  Future<void> logStoreCartView({required int units}) => _analytics.logEvent(
        name: AnalyticsEvents.storeCartView,
        parameters: storeEventParams(units: units),
      );

  /// Quantidade da linha [line] (a chave do carrinho) mudou para [qty].
  Future<void> logStoreCartQty({required String line, required int qty}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCartQty,
        parameters: storeEventParams(line: line, qty: qty),
      );

  Future<void> logStoreCartRemove({required String line}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCartRemove,
        parameters: storeEventParams(line: line, qty: 0),
      );

  Future<void> logStoreAddressSave({required bool isNew}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeAddressSave,
        parameters: storeEventParams(isNew: isNew),
      );

  Future<void> logStoreCouponApply({required String code}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCouponApply,
        parameters: storeEventParams(coupon: code),
      );

  /// [delivery]: `arena` ou `casa`.
  Future<void> logStoreCheckoutPay({
    required int totalCents,
    String? delivery,
    String? coupon,
  }) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeCheckoutPay,
        parameters: storeEventParams(
          totalCents: totalCents,
          delivery: delivery,
          coupon: coupon,
        ),
      );

  Future<void> logStorePixCopy({required String orderId}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storePixCopy,
        parameters: storeEventParams(orderId: orderId),
      );

  Future<void> logStoreOrderView({required String orderId}) =>
      _analytics.logEvent(
        name: AnalyticsEvents.storeOrderView,
        parameters: storeEventParams(orderId: orderId),
      );

  Future<void> logStoreOrdersView() =>
      _analytics.logEvent(name: AnalyticsEvents.storeOrdersView);

  Future<void> logStoreRebuy({required String orderId}) => _analytics.logEvent(
        name: AnalyticsEvents.storeRebuy,
        parameters: storeEventParams(orderId: orderId),
      );
}

final analyticsServiceProvider = Provider<AnalyticsService>(
  (ref) => AnalyticsService(FirebaseAnalytics.instance),
);
