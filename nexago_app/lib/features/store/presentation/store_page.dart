import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
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
import '../application/store_providers.dart';
import '../domain/store_models.dart';
import '../domain/store_pickup.dart';
import '../domain/store_rules.dart';
import 'store_copy.dart';
import 'store_search_page.dart';
import 'widgets/store_banner_carousel.dart';
import 'widgets/store_filter_sheet.dart';
import 'widgets/store_header.dart';
import 'widgets/store_pickup_sheet.dart';
import 'widgets/store_product_card.dart';
import 'widgets/store_skeleton.dart';
import 'widgets/store_style.dart';
import 'widgets/store_variant_sheet.dart';

/// Loja · Vitrine (tela 01, `/loja`).
///
/// Abre mesmo com a flag desligada (link direto, QA) — só a ENTRADA da home
/// depende de `appConfig/store.enabled`. O catálogo inteiro do canal vem numa
/// consulta; a grade pagina no cliente (24 por vez).
class StorePage extends ConsumerStatefulWidget {
  const StorePage({
    super.key,
    this.initialCategoryId,
    this.initialCollectionId,
    this.initialQuery = '',
    this.clock,
  });

  /// `?categoria=`, `?colecao=` e `?q=` (mesmos parâmetros do portal).
  final String? initialCategoryId;
  final String? initialCollectionId;
  final String initialQuery;

  /// Relógio injetável (selo "nova" e banners por data); padrão: agora.
  final DateTime Function()? clock;

  @override
  ConsumerState<StorePage> createState() => _StorePageState();
}

class _StorePageState extends ConsumerState<StorePage> {
  late StoreBrowse _browse = StoreBrowse(
    categoryId: _blankToNull(widget.initialCategoryId),
    collectionId: _blankToNull(widget.initialCollectionId),
    query: widget.initialQuery.trim(),
  );
  final ScrollController _scroll = ScrollController();
  int _visible = kStorePageSize;
  int _resultCount = 0;
  int _bagPulse = 0;

  static String? _blankToNull(String? v) =>
      v == null || v.trim().isEmpty ? null : v.trim();

  DateTime get _now => widget.clock?.call() ?? DateTime.now();

  AnalyticsService get _analytics => ref.read(analyticsServiceProvider);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeShowMore);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _analytics.logStoreShowcaseView();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Paginação no cliente: perto do fim, mais 24.
  void _maybeShowMore() {
    if (!_scroll.hasClients || _visible >= _resultCount) return;
    if (_scroll.position.extentAfter < 900) {
      setState(() => _visible += kStorePageSize);
    }
  }

  void _setBrowse(StoreBrowse next) {
    setState(() {
      _browse = next;
      _visible = kStorePageSize;
    });
  }

  void _selectCategory(String? id) {
    if (id == _browse.categoryId) return;
    _analytics.logStoreCategorySelect(category: id);
    _setBrowse(_browse.copyWith(categoryId: id));
  }

  void _openBanner(StoreBanner banner) {
    _analytics.logStoreBannerClick(campaignId: banner.id);
    _setBrowse(
      _browse.copyWith(
        collectionId: banner.collectionId,
        categoryId: null,
        query: '',
      ),
    );
  }

  Future<void> _openSearch() async {
    final result = await context.pushNamed<StoreSearchResult>(
      AppRouteNames.storeSearch,
      queryParameters: {if (_browse.hasQuery) 'q': _browse.query},
    );
    if (result == null || !mounted) return;
    final categoryId = result.categoryId;
    if (categoryId != null) {
      _analytics.logStoreCategorySelect(category: categoryId);
      _setBrowse(_browse.copyWith(categoryId: categoryId, query: ''));
      return;
    }
    _setBrowse(_browse.copyWith(query: result.query?.trim() ?? ''));
  }

  Future<void> _openFilters({
    required List<StoreProduct> products,
    required StoreShowcaseConfig config,
    required bool hasPickupArena,
  }) async {
    final result = await showStoreFilterSheet(
      context: context,
      initial: _browse.filters,
      hasPickupArena: hasPickupArena,
      countFor: (draft) => browseStoreProducts(
        products,
        config,
        _browse.copyWith(filters: draft),
        hasPickupArena: hasPickupArena,
      ).length,
    );
    if (result == null || !mounted) return;
    _setBrowse(_browse.copyWith(filters: result));
  }

  Future<void> _openPickup(
    StoreShowcaseConfig config,
    StorePickupChoice choice,
  ) async {
    final position = ref.read(storeUserPositionProvider);
    final arenaId = await showStorePickupSheet(
      context: context,
      arenas: config.pickupArenas,
      currentArenaId: choice.arena?.arenaId,
      readyHours: config.benefits.pickupReadyHours,
      userLatitude: position?.latitude,
      userLongitude: position?.longitude,
    );
    if (arenaId == null || !mounted) return;
    _analytics.logStorePickupArenaChange(arenaId: arenaId);
    try {
      await ref.read(storeActionsProvider).choosePickupArena(arenaId);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(context, StoreCopy.pickupSaveError, isError: true);
      }
    }
  }

  void _openProduct(StoreProduct product, int position) {
    _analytics.logStoreProductClick(productId: product.id, position: position);
    context.pushNamed(
      AppRouteNames.storeProduct,
      pathParameters: {'productId': product.id},
      queryParameters: {'origem': 'vitrine'},
    );
  }

  Future<void> _quickAdd(StoreProduct product, int position) async {
    final action = storeQuickAdd(product);
    switch (action.kind) {
      case StoreQuickAddKind.notifyMe:
        showAppSnackBar(context, StoreCopy.waitlistSoon);
      case StoreQuickAddKind.openProduct:
        _openProduct(product, position);
      case StoreQuickAddKind.addDirect:
        await _addToCart(product, action.skuId!);
      case StoreQuickAddKind.pickVariant:
        final skuId = await showStoreVariantSheet(
          context: context,
          product: product,
        );
        if (skuId != null && mounted) await _addToCart(product, skuId);
    }
  }

  Future<void> _addToCart(StoreProduct product, String skuId) async {
    try {
      final added = await ref
          .read(storeActionsProvider)
          .addToCart(productId: product.id, skuId: skuId);
      if (!mounted) return;
      if (!added) {
        showAppSnackBar(context, StoreCopy.cartFull, isError: true);
        return;
      }
      setState(() => _bagPulse++);
      _analytics.logStoreQuickAdd(productId: product.id);
      _showAddedSnackBar();
    } catch (_) {
      if (mounted) showAppSnackBar(context, StoreCopy.addError, isError: true);
    }
  }

  void _showAddedSnackBar() {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: const Text(
            StoreCopy.added,
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          action: SnackBarAction(
            label: StoreCopy.seeCart,
            textColor: AppColors.brand,
            onPressed: _openCart,
          ),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
          backgroundColor: AppColors.black.withValues(alpha: 0.88),
          duration: const Duration(seconds: 4),
        ),
      );
  }

  void _openCart() => context.pushNamed(AppRouteNames.storeCart);

  void _retry() {
    ref.invalidate(storeCatalogProvider);
    ref.invalidate(storeShowcaseConfigProvider);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final catalogAsync = ref.watch(storeCatalogProvider);
    final catalog = catalogAsync.valueOrNull;
    final config = ref.watch(storeShowcaseConfigProvider).valueOrNull ??
        StoreShowcaseConfig.empty;

    final Widget body;
    if (catalog == null && catalogAsync.hasError) {
      body = AppErrorView(
        title: StoreCopy.errorTitle,
        message: StoreCopy.errorMessage,
        retryLabel: StoreCopy.retry,
        onRetry: _retry,
      );
    } else if (catalog == null ||
        (catalog.fromCache && catalog.products.isEmpty)) {
      // Cache vazio ainda não é "loja vazia": é o servidor que não respondeu.
      body = const StoreShowcaseSkeleton();
    } else {
      body = _buildShowcase(catalog.products, config);
    }

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          0,
          AppSpacing.screenH,
          AppSpacing.md,
        ),
        header: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            StoreHeader(
              cartUnits: ref.watch(storeCartUnitsProvider),
              pulseTick: _bagPulse,
              onBack: () => popOrGo(context, AppRoutes.discover),
              onSearch: _openSearch,
              onCart: _openCart,
            ),
            _OfflineStrip(offline: catalog?.fromCache ?? false),
          ],
        ),
        child: body,
      ),
    );
  }

  Widget _buildShowcase(
    List<StoreProduct> products,
    StoreShowcaseConfig config,
  ) {
    final now = _now;
    final banners = liveStoreBanners(config.banners, storeSaoPauloDateKey(now));
    final categories = visibleStoreCategories(config, products);
    final choice = ref.watch(storePickupChoiceProvider);
    final hasPickupArena = choice?.arena != null;
    final results = browseStoreProducts(
      products,
      config,
      _browse,
      hasPickupArena: hasPickupArena,
    );
    _resultCount = results.length;
    final shown = math.min(_visible, results.length);
    final extent = StoreProductCard.extent(MediaQuery.textScalerOf(context));
    final pixPct = config.benefits.pixDiscountPct;
    final bottom = MediaQuery.paddingOf(context).bottom;

    SliverGridDelegate gridDelegate() =>
        SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: StoreStyle.gridGap,
          mainAxisSpacing: 18,
          mainAxisExtent: extent,
        );

    Widget grid(List<StoreProduct> items, int count) => SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          sliver: SliverGrid(
            gridDelegate: gridDelegate(),
            delegate: SliverChildBuilderDelegate(
              (context, i) {
                final product = items[i];
                return StoreProductCard(
                  key: ValueKey('store-product-${product.id}'),
                  product: product,
                  now: now,
                  pixDiscountPct: pixPct,
                  onTap: () => _openProduct(product, i + 1),
                  onQuickAdd: () => _quickAdd(product, i + 1),
                );
              },
              childCount: count,
            ),
          ),
        );

    final Widget gridOrEmpty;
    if (products.isEmpty) {
      gridOrEmpty = const SliverToBoxAdapter(
        child: _EmptyMessage(
          icon: Icons.storefront_outlined,
          title: StoreCopy.emptyCatalog,
          message: StoreCopy.emptyCatalogHint,
        ),
      );
    } else if (results.isEmpty && _browse.hasQuery) {
      final bestSellers =
          sortStoreProducts(products, StoreSort.bestSellers).take(4).toList();
      gridOrEmpty = SliverMainAxisGroup(
        slivers: [
          SliverToBoxAdapter(
            child: _EmptyMessage(
              icon: Icons.search_off_rounded,
              title: StoreCopy.searchNotFound(_browse.query),
              message: StoreCopy.searchNotFoundHint,
              actionLabel: StoreCopy.clearSearch,
              onAction: () => _setBrowse(_browse.copyWith(query: '')),
            ),
          ),
          grid(bestSellers, bestSellers.length),
        ],
      );
    } else if (results.isEmpty) {
      gridOrEmpty = SliverToBoxAdapter(
        child: _EmptyMessage(
          icon: Icons.filter_alt_off_outlined,
          title: StoreCopy.emptyFilters,
          actionLabel: StoreCopy.clearFilters,
          onAction: () => _setBrowse(StoreBrowse.initial),
        ),
      );
    } else {
      gridOrEmpty = grid(results, shown);
    }

    return CustomScrollView(
      controller: _scroll,
      slivers: [
        if (banners.isNotEmpty)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              4,
              AppSpacing.screenH,
              AppSpacing.lg,
            ),
            sliver: SliverToBoxAdapter(
              child: StoreBannerCarousel(
                banners: banners,
                onTap: _openBanner,
              ),
            ),
          )
        else
          const SliverToBoxAdapter(child: SizedBox(height: 4)),
        SliverToBoxAdapter(
          child: _CategoryChips(
            categories: categories,
            selectedId: _browse.categoryId,
            onSelect: _selectCategory,
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 14)),
        if (choice != null && config.pickupArenas.isNotEmpty)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              0,
              AppSpacing.screenH,
              18,
            ),
            sliver: SliverToBoxAdapter(
              child: _PickupStrip(
                arena: choice.arena,
                onTap: () => _openPickup(config, choice),
              ),
            ),
          )
        else
          const SliverToBoxAdapter(child: SizedBox(height: 6)),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            0,
            AppSpacing.screenH,
            14,
          ),
          sliver: SliverToBoxAdapter(
            child: _GridTitle(
              title: storeGridTitle(_browse, config),
              filterCount: _browse.filters.activeCount,
              onClear: _browse.hasQuery
                  ? () => _setBrowse(_browse.copyWith(query: ''))
                  : _browse.collectionId != null
                      ? () => _setBrowse(_browse.copyWith(collectionId: null))
                      : null,
              onFilter: () => _openFilters(
                products: products,
                config: config,
                hasPickupArena: hasPickupArena,
              ),
            ),
          ),
        ),
        gridOrEmpty,
        if (shown < results.length)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              18,
              AppSpacing.screenH,
              0,
            ),
            sliver: SliverGrid(
              gridDelegate: gridDelegate(),
              delegate: SliverChildBuilderDelegate(
                (_, _) => const StoreProductCardSkeleton(),
                childCount: 2,
              ),
            ),
          ),
        SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxxl + bottom)),
      ],
    );
  }
}

class _CategoryChips extends StatelessWidget {
  const _CategoryChips({
    required this.categories,
    required this.selectedId,
    required this.onSelect,
  });

  final List<StoreLabel> categories;
  final String? selectedId;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
        itemCount: categories.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          if (i == 0) {
            return StoreChoicePill(
              label: StoreCopy.allCategories,
              selected: selectedId == null,
              onTap: () => onSelect(null),
            );
          }
          final category = categories[i - 1];
          return StoreChoicePill(
            label: category.label,
            selected: selectedId == category.id,
            onTap: () => onSelect(category.id),
          );
        },
      ),
    );
  }
}

class _PickupStrip extends StatelessWidget {
  const _PickupStrip({required this.arena, required this.onTap});

  final StorePickupArena? arena;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final arena = this.arena;
    final base = AppTypography.soraRegular(
      fontSize: 12.5,
      fontWeight: FontWeight.w400,
      color: StoreStyle.secondary(colors),
    );
    return Material(
      color: StoreStyle.surface(colors),
      borderRadius: AppRadii.mdAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              const Icon(
                Icons.place_outlined,
                size: 17,
                color: AppColors.brand,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text.rich(
                  arena == null
                      ? const TextSpan(text: StoreCopy.pickupEmpty)
                      : TextSpan(
                          children: [
                            const TextSpan(text: StoreCopy.pickupPrefix),
                            TextSpan(
                              text: arena.name,
                              style: TextStyle(
                                color: colors.onSurface,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: base,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                arena == null ? StoreCopy.pickupChoose : StoreCopy.pickupChange,
                style: base.copyWith(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GridTitle extends StatelessWidget {
  const _GridTitle({
    required this.title,
    required this.filterCount,
    required this.onFilter,
    this.onClear,
  });

  final String title;
  final int filterCount;
  final VoidCallback onFilter;

  /// Tira a busca (ou a coleção do banner) — `null` quando não há o que tirar.
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        Flexible(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.36,
              color: colors.onSurface,
            ),
          ),
        ),
        if (onClear != null)
          IconButton(
            tooltip: StoreCopy.clearSearch,
            visualDensity: VisualDensity.compact,
            iconSize: 18,
            color: StoreStyle.secondary(colors),
            onPressed: onClear,
            icon: const Icon(Icons.close_rounded),
          ),
        const Spacer(),
        InkWell(
          onTap: onFilter,
          borderRadius: AppRadii.smAll,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Text(
              StoreCopy.filterWithCount(filterCount),
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: filterCount > 0 ? FontWeight.w600 : FontWeight.w400,
                color: filterCount > 0
                    ? AppColors.brand
                    : StoreStyle.tertiary(colors),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptyMessage extends StatelessWidget {
  const _EmptyMessage({
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final message = this.message;
    final actionLabel = this.actionLabel;
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 24, 32, 28),
      child: Column(
        children: [
          Icon(icon, size: 40, color: StoreStyle.tertiary(colors)),
          const SizedBox(height: AppSpacing.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.titleM.copyWith(color: colors.onSurface),
          ),
          if (message != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                color: StoreStyle.secondary(colors),
              ),
            ),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(
              onPressed: onAction,
              style: OutlinedButton.styleFrom(
                foregroundColor: colors.onSurface,
                side: BorderSide(color: StoreStyle.tertiary(colors)),
                shape: const RoundedRectangleBorder(
                  borderRadius: AppRadii.pillAll,
                ),
              ),
              child: Text(actionLabel),
            ),
          ],
        ],
      ),
    );
  }
}

/// "Sem conexão" só depois de um respiro: ao abrir com cache, o primeiro
/// snapshot sempre vem do cache e o do servidor chega logo em seguida — a
/// faixa piscaria a cada abertura.
class _OfflineStrip extends StatefulWidget {
  const _OfflineStrip({required this.offline});

  final bool offline;

  @override
  State<_OfflineStrip> createState() => _OfflineStripState();
}

class _OfflineStripState extends State<_OfflineStrip> {
  static const _grace = Duration(milliseconds: 1500);

  Timer? _timer;
  bool _show = false;

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(_OfflineStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.offline != widget.offline) _sync();
  }

  void _sync() {
    _timer?.cancel();
    _timer = null;
    if (!widget.offline) {
      _show = false;
      return;
    }
    _timer = Timer(_grace, () {
      if (mounted) setState(() => _show = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_show) return const SizedBox.shrink();
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.pending.withValues(alpha: 0.12),
          borderRadius: AppRadii.smAll,
        ),
        child: Row(
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              size: 16,
              color: AppColors.pending,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                StoreCopy.offline,
                style: AppTypography.bodyS.copyWith(color: colors.onSurface),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
