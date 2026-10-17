import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/links/nexago_links.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_share.dart';
import '../application/store_providers.dart';
import '../domain/store_models.dart';
import '../domain/store_product_rules.dart';
import '../domain/store_rules.dart';
import 'store_copy.dart';
import 'widgets/store_header.dart';
import 'widgets/store_pickup_sheet.dart';
import 'widgets/store_product_bottom_bar.dart';
import 'widgets/store_product_card.dart';
import 'widgets/store_product_gallery.dart';
import 'widgets/store_product_options.dart';
import 'widgets/store_product_sections.dart';
import 'widgets/store_skeleton.dart';
import 'widgets/store_style.dart';

/// Id da retirada na escolha do "Como receber" (e no `loja_entrega_select`).
const String _pickupOptionId = 'retirada';

/// Loja · Produto (tela 02, `/loja/produto/:productId`).
///
/// Lê o produto do MESMO catálogo que a vitrine escuta (nada de consulta
/// nova). Regras em `docs/business-rules/loja-produto.md` /
/// `store_product_rules.dart`.
class StoreProductPage extends ConsumerStatefulWidget {
  const StoreProductPage({
    super.key,
    required this.productId,
    this.origin,
    this.clock,
  });

  /// Id do produto (ou o slug do link do portal).
  final String productId;

  /// `?origem=` (`vitrine`, `busca`, `relacionado`, `indisponivel`); sem
  /// origem (deep link) vai como `link` no `loja_produto_view`.
  final String? origin;

  /// Relógio injetável (selo "nova" e prazo da retirada); padrão: agora.
  final DateTime Function()? clock;

  @override
  ConsumerState<StoreProductPage> createState() => _StoreProductPageState();
}

class _StoreProductPageState extends ConsumerState<StoreProductPage> {
  static const double _galleryHeight = 440;
  static const double _panelOverlap = 28;
  static const int _relatedLimit = 8;
  static const Duration _offlineGrace = Duration(milliseconds: 1500);
  static const Duration _addedFor = Duration(milliseconds: 1500);

  final ScrollController _scroll = ScrollController();
  final Map<String, GlobalKey> _axisKeys = {};

  Map<String, String>? _selected;
  int _qty = 1;
  String? _missingAxisId;
  int _shakeTick = 0;
  int _bagPulse = 0;
  bool _collapsed = false;
  double _collapseAt = 340;
  bool _adding = false;
  bool _justAdded = false;
  bool? _favoriteOverride;
  String? _receiveOptionId;
  bool _viewLogged = false;
  bool _offline = false;
  Timer? _offlineTimer;
  Timer? _addedTimer;

  DateTime get _now => widget.clock?.call() ?? DateTime.now();

  AnalyticsService get _analytics => ref.read(analyticsServiceProvider);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    ref.listenManual<StoreProductLookup>(
      storeProductProvider(widget.productId),
      (_, next) => _onLookup(next),
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _offlineTimer?.cancel();
    _addedTimer?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  void _onLookup(StoreProductLookup next) {
    final product = next.product;
    if (product != null && !_viewLogged) {
      _viewLogged = true;
      _analytics.logStoreProductView(
        productId: product.id,
        origin: widget.origin ?? 'link',
      );
    }
    _syncOffline(next.status == StoreProductStatus.found && next.fromCache);
  }

  /// "Sem conexão" só depois de um respiro: o primeiro snapshot sempre vem do
  /// cache e o do servidor chega logo em seguida (mesma folga da vitrine).
  void _syncOffline(bool fromCache) {
    if (!fromCache) {
      _offlineTimer?.cancel();
      _offlineTimer = null;
      if (_offline && mounted) setState(() => _offline = false);
      return;
    }
    if (_offline || _offlineTimer != null) return;
    _offlineTimer = Timer(_offlineGrace, () {
      _offlineTimer = null;
      if (mounted) setState(() => _offline = true);
    });
  }

  void _onScroll() {
    final collapsed = _scroll.hasClients && _scroll.offset > _collapseAt;
    if (collapsed != _collapsed) setState(() => _collapsed = collapsed);
  }

  // ── Navegação ─────────────────────────────────────────────────────────

  void _back() => popOrGo(context, AppRoutes.store);

  void _openCart() => context.pushNamed(AppRouteNames.storeCart);

  void _openProduct(StoreProduct product, String origin) {
    context.pushNamed(
      AppRouteNames.storeProduct,
      pathParameters: {'productId': product.id},
      queryParameters: {'origem': origin},
    );
  }

  void _openRelated(StoreProduct product) {
    _analytics.logStoreRelatedClick(productId: product.id);
    _openProduct(product, 'relacionado');
  }

  void _share(StoreProduct product) {
    final key = product.slug.isNotEmpty ? product.slug : product.id;
    final url = '$kAthletePortalBaseUrl/loja/p/${Uri.encodeComponent(key)}';
    nexaShareText(context, '${product.name}\n$url', subject: product.name);
  }

  // ── Favorito ──────────────────────────────────────────────────────────

  bool _isFavorite(StoreProduct product) {
    final saved = (ref.watch(storeShopperProvider).valueOrNull?.favoriteIds ??
            const <String>[])
        .contains(product.id);
    // O stream alcançou a escolha otimista: volta a valer o servidor.
    if (_favoriteOverride == saved) _favoriteOverride = null;
    return _favoriteOverride ?? saved;
  }

  Future<void> _toggleFavorite(StoreProduct product, bool current) async {
    final next = !current;
    setState(() => _favoriteOverride = next);
    _analytics.logStoreFavorite(productId: product.id, on: next);
    try {
      await ref.read(storeActionsProvider).toggleFavorite(product.id, on: next);
    } catch (_) {
      if (!mounted) return;
      setState(() => _favoriteOverride = current);
      showAppSnackBar(context, StoreCopy.favoriteError, isError: true);
    }
  }

  // ── Variação ──────────────────────────────────────────────────────────

  void _select(StoreProduct product, StoreAxis axis, StoreAxisValue value) {
    final current = _selected ?? storeProductInitialSelection(product);
    final next = selectStoreAxisValue(product, current, axis.id, value.id);
    setState(() {
      _selected = next;
      if (_missingAxisId != null && next.containsKey(_missingAxisId)) {
        _missingAxisId = null;
      }
    });
    String? color;
    String? size;
    for (final a in product.axes) {
      final chosen = next[a.id];
      if (chosen == null) continue;
      if (isStoreColorAxis(a)) {
        color ??= chosen;
      } else {
        size = chosen;
      }
    }
    _analytics.logStoreVariantSelect(color: color, size: size);
  }

  /// Valor sem saldo: o "Avise-me" ainda não existe.
  void _notifyMe(StoreProduct product, Map<String, String> selection) {
    _analytics.logStoreNotifyMe(sku: storeVariantFor(product, selection)?.id);
    showAppSnackBar(context, StoreCopy.waitlistSoon);
  }

  /// "Personalizar" exige o SKU completo (sem tamanho: o mesmo tremor do
  /// "Adicionar"). Volta `true` = a linha personalizada entrou no carrinho.
  Future<void> _customize(
    StoreProduct product,
    Map<String, String> selected,
  ) async {
    final variant = _chosenVariant(product, selected);
    if (variant == null) return;
    final added = await context.pushNamed<bool>(
      AppRouteNames.storeCustomize,
      pathParameters: {'productId': product.id},
      queryParameters: {'sku': variant.id},
    );
    if (added != true || !mounted) return;
    setState(() => _bagPulse++);
    _showAddedSnackBar();
  }

  /// SKU da escolha, pronto para comprar. Eixo faltando treme (e rola até
  /// ele); combinação sem SKU ou que acabou avisa. `null` = não seguir.
  StoreVariant? _chosenVariant(
    StoreProduct product,
    Map<String, String> selected,
  ) {
    final missing = storeMissingAxis(product, selected);
    if (missing != null) {
      setState(() {
        _missingAxisId = missing.id;
        _shakeTick++;
      });
      final anchor = _axisKeys[missing.id]?.currentContext;
      if (anchor != null) {
        Scrollable.ensureVisible(
          anchor,
          alignment: 0.3,
          duration: const Duration(milliseconds: 280),
        );
      }
      return null;
    }
    final variant = storeVariantFor(product, selected);
    if (variant == null) {
      showAppSnackBar(context, StoreCopy.comboUnavailable);
      return null;
    }
    // O listener já trouxe o saldo novo: o SKU acabou depois da escolha.
    if (!variant.inStock) {
      showAppSnackBar(context, storeSoldOutMessage(product, variant));
      return null;
    }
    return variant;
  }

  // ── Carrinho ──────────────────────────────────────────────────────────

  Future<void> _add(
    StoreProduct product,
    Map<String, String> selected,
    int qty,
  ) async {
    if (_adding) return;
    final variant = _chosenVariant(product, selected);
    if (variant == null) return;
    final cap = variant.maxQty.clamp(1, kStoreMaxQtyPerItem);
    final cart =
        ref.read(storeCartProvider).valueOrNull ?? const <StoreCartItem>[];
    final inCart = storeCartQtyOf(
      cart,
      productId: product.id,
      skuId: variant.id,
    );
    if (inCart >= cap) {
      showAppSnackBar(context, StoreCopy.cartLineAtMax(cap));
      return;
    }
    if (inCart == 0 && cart.length >= kStoreMaxCartLines) {
      showAppSnackBar(context, StoreCopy.cartFull, isError: true);
      return;
    }

    setState(() => _adding = true);
    try {
      final added = await ref.read(storeActionsProvider).addToCart(
            productId: product.id,
            skuId: variant.id,
            qty: qty,
            maxQty: cap,
          );
      if (!mounted) return;
      if (!added) {
        showAppSnackBar(context, StoreCopy.cartFull, isError: true);
        return;
      }
      _analytics.logStoreAddToCart(
        sku: variant.id,
        qty: qty,
        priceCents: variant.priceCents,
      );
      _addedTimer?.cancel();
      setState(() {
        _justAdded = true;
        _bagPulse++;
      });
      _addedTimer = Timer(_addedFor, () {
        if (mounted) setState(() => _justAdded = false);
      });
      _showAddedSnackBar(cappedAt: inCart + qty > cap ? cap : null);
    } catch (_) {
      if (mounted) showAppSnackBar(context, StoreCopy.addError, isError: true);
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  void _showAddedSnackBar({int? cappedAt}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Text(
            cappedAt != null
                ? StoreCopy.cartLineCapped(cappedAt)
                : StoreCopy.addedToCart,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          action: SnackBarAction(
            label: StoreCopy.see,
            textColor: AppColors.brand,
            onPressed: _openCart,
          ),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
          backgroundColor: AppColors.black.withValues(alpha: 0.88),
          duration: const Duration(seconds: 4),
          // Com ação o SnackBar fica até ser fechado (`persist` padrão) e
          // ignora o `duration` — seguia até por cima da tela seguinte.
          persist: false,
        ),
      );
  }

  // ── Como receber ──────────────────────────────────────────────────────

  Future<void> _changeArena(StoreShowcaseConfig config) async {
    final position = ref.read(storeUserPositionProvider);
    final arenaId = await showStorePickupSheet(
      context: context,
      arenas: config.pickupArenas,
      currentArenaId: ref.read(storePickupChoiceProvider)?.arena?.arenaId,
      readyHours: config.benefits.pickupReadyHours,
      userLatitude: position?.latitude,
      userLongitude: position?.longitude,
    );
    if (arenaId == null || !mounted) return;
    _analytics.logStorePickupArenaChange(arenaId: arenaId);
    setState(() => _receiveOptionId = _pickupOptionId);
    try {
      await ref.read(storeActionsProvider).choosePickupArena(arenaId);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, StoreCopy.pickupSaveError, isError: true);
      }
    }
  }

  Future<void> _openReceive(
      _ReceivePlan plan, StoreShowcaseConfig config) async {
    final result = await showStoreReceiveSheet(
      context: context,
      options: plan.options,
      selectedId: _receiveOptionId,
      arenaActionLabel: plan.arenaActionLabel,
      footnote: plan.footnote,
    );
    if (result == null || !mounted) return;
    final id = result.optionId;
    if (result.changeArena || (id == _pickupOptionId && !plan.hasArena)) {
      await _changeArena(config);
      return;
    }
    if (id == null) return;
    _analytics.logStoreDeliverySelect(type: id);
    setState(() => _receiveOptionId = id);
  }

  _ReceivePlan? _receivePlan({
    required StoreProduct product,
    required StoreShowcaseConfig config,
    required int subtotalCents,
  }) {
    final hasPickup = product.pickup && config.pickupArenas.isNotEmpty;
    final delivery = config.delivery;
    final hasDelivery = product.delivery && delivery.modes.isNotEmpty;
    if (!hasPickup && !hasDelivery) return null;

    final arena =
        hasPickup ? ref.watch(storePickupChoiceProvider)?.arena : null;
    final ready =
        arena == null ? null : storePickupReady(arena.readyHours, _now);
    final options = <StoreReceiveOption>[
      if (hasPickup)
        StoreReceiveOption(
          id: _pickupOptionId,
          icon: Icons.storefront_outlined,
          title: arena == null
              ? StoreCopy.receiveNoArena
              : StoreCopy.pickupAt(arena.name),
          subtitle: ready?.label ?? '',
          priceLabel: StoreCopy.receiveFree,
          free: true,
        ),
      if (hasDelivery)
        for (final mode in delivery.modes)
          _deliveryOption(mode, subtotalCents, delivery.freeAboveCents),
    ];
    final fromCents =
        hasDelivery ? storeDeliveryFromCents(delivery, subtotalCents) : null;

    // Linha-resumo: a opção escolhida; senão, o panorama.
    IconData icon;
    String title;
    String subtitle;
    final chosen = options.where((o) => o.id == _receiveOptionId).firstOrNull;
    if (chosen != null && chosen.id == _pickupOptionId && ready != null) {
      icon = Icons.storefront_outlined;
      title = StoreCopy.pickupSummary(ready.day);
      subtitle = arena!.name;
    } else if (chosen != null && chosen.id != _pickupOptionId) {
      icon = Icons.local_shipping_outlined;
      title = '${chosen.title} · ${chosen.priceLabel}';
      subtitle = chosen.subtitle;
    } else if (hasPickup) {
      icon = Icons.storefront_outlined;
      title = ready == null
          ? StoreCopy.receiveNoArena
          : StoreCopy.pickupSummary(ready.day);
      final where = arena?.name ?? '';
      final also = hasDelivery ? StoreCopy.orDeliveryFrom(fromCents) : '';
      subtitle = [where, also].where((s) => s.isNotEmpty).join(' · ');
    } else {
      icon = Icons.local_shipping_outlined;
      title = StoreCopy.deliveryFrom(fromCents);
      final free = delivery.freeAboveCents;
      subtitle = free != null
          ? StoreCopy.freeShippingAbove(free)
          : delivery.modes.map((m) => m.name).join(' · ');
    }

    final free = delivery.freeAboveCents;
    return _ReceivePlan(
      options: options,
      icon: icon,
      title: title,
      subtitle: subtitle,
      hasArena: arena != null,
      arenaActionLabel: !hasPickup
          ? null
          : arena == null
              ? StoreCopy.receiveChooseArena
              : StoreCopy.receiveChangeArena,
      footnote:
          hasDelivery && free != null ? StoreCopy.freeShippingAbove(free) : '',
    );
  }

  StoreReceiveOption _deliveryOption(
    StoreDeliveryMode mode,
    int subtotalCents,
    int? freeAboveCents,
  ) {
    final price = storeDeliveryPriceCents(mode, subtotalCents, freeAboveCents);
    return StoreReceiveOption(
      id: mode.id,
      icon: Icons.local_shipping_outlined,
      title: mode.name,
      subtitle: mode.description,
      priceLabel: switch (price) {
        null => StoreCopy.receiveAtCheckout,
        0 => StoreCopy.receiveFree,
        _ => StoreCopy.price(price),
      },
      free: price == 0,
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final lookup = ref.watch(storeProductProvider(widget.productId));
    final product = lookup.product;
    switch (lookup.status) {
      case StoreProductStatus.loading:
        return _shell(
          StoreProductSkeleton(galleryHeight: _galleryHeight),
        );
      case StoreProductStatus.error:
        return _shell(
          AppErrorView(
            title: StoreCopy.errorTitle,
            message: StoreCopy.errorMessage,
            retryLabel: StoreCopy.retry,
            onRetry: () => ref.invalidate(storeCatalogProvider),
          ),
          withTopGap: true,
        );
      case StoreProductStatus.notFound:
        return _unavailable(lookup.products);
      case StoreProductStatus.found:
        return _buildProduct(product!, lookup.products);
    }
  }

  /// Carregando / erro: só o "voltar" por cima.
  Widget _shell(Widget body, {bool withTopGap = false}) {
    final colors = context.themeColors;
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: Stack(
        children: [
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.only(top: withTopGap ? top + 60 : 0),
              child: body,
            ),
          ),
          Positioned(
            top: top + 8,
            left: 16,
            child: StoreRoundButton(
              icon: Icons.chevron_left_rounded,
              iconSize: 26,
              tooltip: StoreCopy.back,
              glass: !withTopGap,
              onTap: _back,
            ),
          ),
        ],
      ),
    );
  }

  Widget _unavailable(List<StoreProduct> products) {
    final colors = context.themeColors;
    final now = _now;
    final bestSellers =
        sortStoreProducts(products, StoreSort.bestSellers).take(4).toList();
    final pixPct = ref
        .watch(storeShowcaseConfigProvider)
        .valueOrNull
        ?.benefits
        .pixDiscountPct;
    final extent = StoreProductCard.extent(MediaQuery.textScalerOf(context));
    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.md,
        ),
        header: Row(
          children: [
            StoreRoundButton(
              icon: Icons.chevron_left_rounded,
              iconSize: 26,
              tooltip: StoreCopy.back,
              onTap: _back,
            ),
            const Spacer(),
            StoreBagButton(
              units: ref.watch(storeCartUnitsProvider),
              pulseTick: _bagPulse,
              onTap: _openCart,
            ),
          ],
        ),
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(32, 24, 32, 28),
                child: Column(
                  children: [
                    Icon(
                      Icons.inventory_2_outlined,
                      size: 40,
                      color: StoreStyle.tertiary(colors),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      StoreCopy.unavailableTitle,
                      textAlign: TextAlign.center,
                      style: AppTypography.titleM.copyWith(
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      StoreCopy.unavailableHint,
                      textAlign: TextAlign.center,
                      style: AppTypography.bodyS.copyWith(
                        color: StoreStyle.secondary(colors),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
              sliver: SliverGrid(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: StoreStyle.gridGap,
                  mainAxisSpacing: 18,
                  mainAxisExtent: extent,
                ),
                delegate: SliverChildBuilderDelegate(
                  (_, i) {
                    final p = bestSellers[i];
                    return StoreProductCard(
                      key: ValueKey('store-product-${p.id}'),
                      product: p,
                      now: now,
                      pixDiscountPct: pixPct,
                      onTap: () => _openProduct(p, 'indisponivel'),
                      onQuickAdd: () => _openProduct(p, 'indisponivel'),
                    );
                  },
                  childCount: bestSellers.length,
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xl,
                  AppSpacing.screenH,
                  AppSpacing.xxxl + MediaQuery.paddingOf(context).bottom,
                ),
                child: Center(
                  child: OutlinedButton(
                    onPressed: () => context.goNamed(AppRouteNames.store),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.onSurface,
                      side: BorderSide(color: StoreStyle.tertiary(colors)),
                      shape: const RoundedRectangleBorder(
                        borderRadius: AppRadii.pillAll,
                      ),
                    ),
                    child: const Text(StoreCopy.backToStore),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProduct(StoreProduct product, List<StoreProduct> catalog) {
    final colors = context.themeColors;
    final now = _now;
    final config = ref.watch(storeShowcaseConfigProvider).valueOrNull ??
        StoreShowcaseConfig.empty;
    final selected = _selected ??= storeProductInitialSelection(product);
    for (final axis in product.axes) {
      _axisKeys.putIfAbsent(axis.id, GlobalKey.new);
    }
    final price = storeSelectionPrice(product, selected);
    final maxQty = storeMaxQuantity(product, selected);
    final qty = _qty.clamp(1, maxQty);
    final related = storeRelatedProducts(product, catalog, _relatedLimit);
    final favorite = _isFavorite(product);
    final receive = _receivePlan(
      product: product,
      config: config,
      subtotalCents: price.cents * qty,
    );
    final media = MediaQuery.of(context);
    final topBarHeight = media.padding.top + 8 + StoreStyle.headerButton + 10;
    _collapseAt = _galleryHeight - _panelOverlap - topBarHeight;

    final StoreProductCta cta;
    if (product.soldOut) {
      cta = StoreProductCta.notifyMe;
    } else if (_offline) {
      cta = StoreProductCta.offline;
    } else if (_justAdded) {
      cta = StoreProductCta.added;
    } else {
      cta = StoreProductCta.add;
    }

    final customization = product.customization;
    final hasDetails =
        product.details.isNotEmpty || product.description.isNotEmpty;

    final panel = Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(_panelOverlap),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        24,
        AppSpacing.screenH,
        8,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          StoreProductHeadline(
            product: product,
            price: price,
            now: now,
            collectionLabel:
                storeLabelOf(config.collections, product.collection),
            pixDiscountPct: config.benefits.pixDiscountPct,
          ),
          if (product.axes.isNotEmpty) ...[
            const SizedBox(height: 26),
            StoreProductOptions(
              product: product,
              selected: selected,
              missingAxisId: _missingAxisId,
              shakeTick: _shakeTick,
              lowStockCaption: storeLowStockCaption(product, selected),
              axisKeys: _axisKeys,
              onSelect: (axis, value) => _select(product, axis, value),
              onUnavailable: (axis, value) =>
                  _notifyMe(product, {...selected, axis.id: value.id}),
            ),
          ] else if (storeLowStockCaption(product, selected)
              case final caption?) ...[
            const SizedBox(height: 16),
            Text(
              caption,
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: AppColors.brand,
              ),
            ),
          ],
          if (customization != null) ...[
            const SizedBox(height: 24),
            StoreCustomizeBlock(
              customization: customization,
              onCustomize: customization.hasOptions
                  ? () => _customize(product, selected)
                  : null,
            ),
          ],
          if (receive != null) ...[
            const SizedBox(height: 26),
            StoreReceiveRow(
              icon: receive.icon,
              title: receive.title,
              subtitle: receive.subtitle,
              onTap: () => _openReceive(receive, config),
            ),
          ],
          if (hasDetails) ...[
            const SizedBox(height: 28),
            StoreProductDetails(
              details: product.details,
              description: product.description,
            ),
          ],
        ],
      ),
    );

    return Scaffold(
      backgroundColor: colors.canvas,
      extendBody: true,
      bottomNavigationBar: StoreProductBottomBar(
        cta: cta,
        qty: qty,
        maxQty: maxQty,
        totalCents: price.cents * qty,
        busy: _adding,
        onQtyChanged: (v) => setState(() => _qty = v),
        onPrimary: () {
          if (cta == StoreProductCta.notifyMe) {
            _notifyMe(product, selected);
          } else if (cta == StoreProductCta.add) {
            _add(product, selected, qty);
          }
        },
      ),
      body: Stack(
        children: [
          CustomScrollView(
            controller: _scroll,
            slivers: [
              SliverToBoxAdapter(
                child: Stack(
                  children: [
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      height: _galleryHeight,
                      child: StoreProductGallery(
                        photos: storeGalleryPhotos(product, selected),
                        placeholderLabel:
                            storeLabelOf(config.categories, product.category),
                        height: _galleryHeight,
                        bottomInset: _panelOverlap,
                        dimmed: product.soldOut,
                        onSwipe: () => _analytics.logStorePhotoSwipe(),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(
                        top: _galleryHeight - _panelOverlap,
                      ),
                      child: panel,
                    ),
                  ],
                ),
              ),
              if (related.isNotEmpty)
                SliverPadding(
                  padding: const EdgeInsets.only(top: 24),
                  sliver: SliverToBoxAdapter(
                    child: StoreRelatedCarousel(
                      products: related,
                      onTap: _openRelated,
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: StoreProductBottomBar.height +
                      media.padding.bottom +
                      AppSpacing.xl,
                ),
              ),
            ],
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _ProductTopBar(
              collapsed: _collapsed,
              title: product.name,
              favorite: favorite,
              cartUnits: ref.watch(storeCartUnitsProvider),
              pulseTick: _bagPulse,
              onBack: _back,
              onShare: () => _share(product),
              onFavorite: () => _toggleFavorite(product, favorite),
              onCart: _openCart,
            ),
          ),
        ],
      ),
    );
  }
}

/// O que a linha "Como receber" e a folha dela mostram.
class _ReceivePlan {
  const _ReceivePlan({
    required this.options,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.hasArena,
    required this.arenaActionLabel,
    required this.footnote,
  });

  final List<StoreReceiveOption> options;
  final IconData icon;
  final String title;
  final String subtitle;
  final bool hasArena;
  final String? arenaActionLabel;
  final String footnote;
}

/// Botões flutuantes sobre a foto (voltar · compartilhar · favoritar ·
/// sacola). Passando da galeria, ganha fundo sólido e o nome do produto.
///
/// Fica FORA da lista de propósito (ver `NexaPageHeader`): header dentro do
/// `Scrollable` não responde logo depois de rolar.
class _ProductTopBar extends StatelessWidget {
  const _ProductTopBar({
    required this.collapsed,
    required this.title,
    required this.favorite,
    required this.cartUnits,
    required this.pulseTick,
    required this.onBack,
    required this.onShare,
    required this.onFavorite,
    required this.onCart,
  });

  final bool collapsed;
  final String title;
  final bool favorite;
  final int cartUnits;
  final int pulseTick;
  final VoidCallback onBack;
  final VoidCallback onShare;
  final VoidCallback onFavorite;
  final VoidCallback onCart;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final top = MediaQuery.paddingOf(context).top;
    const fade = Duration(milliseconds: 180);
    final glass = !collapsed;
    return Stack(
      children: [
        Positioned.fill(
          child: IgnorePointer(
            ignoring: !collapsed,
            child: AnimatedOpacity(
              opacity: collapsed ? 1 : 0,
              duration: fade,
              child: ColoredBox(color: colors.canvas),
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(16, top + 8, 16, 10),
          child: Row(
            children: [
              StoreRoundButton(
                icon: Icons.chevron_left_rounded,
                iconSize: 26,
                tooltip: StoreCopy.back,
                glass: glass,
                onTap: onBack,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: IgnorePointer(
                  child: AnimatedOpacity(
                    opacity: collapsed ? 1 : 0,
                    duration: fade,
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              StoreRoundButton(
                icon: Icons.ios_share_rounded,
                tooltip: StoreCopy.share,
                glass: glass,
                onTap: onShare,
              ),
              const SizedBox(width: 8),
              StoreRoundButton(
                key: const ValueKey('store-product-favorite'),
                icon: favorite
                    ? Icons.favorite_rounded
                    : Icons.favorite_border_rounded,
                iconColor: favorite ? AppColors.brand : null,
                tooltip:
                    favorite ? StoreCopy.favoriteRemove : StoreCopy.favoriteAdd,
                glass: glass,
                onTap: onFavorite,
              ),
              const SizedBox(width: 8),
              StoreBagButton(
                units: cartUnits,
                pulseTick: pulseTick,
                glass: glass,
                onTap: onCart,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
