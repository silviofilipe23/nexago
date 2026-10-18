import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/store_providers.dart';
import '../domain/store_favorites_rules.dart';
import '../domain/store_models.dart';
import '../domain/store_product_rules.dart';
import 'store_copy.dart';
import 'store_search_page.dart';
import 'widgets/store_added_snack_bar.dart';
import 'widgets/store_favorite_card.dart';
import 'widgets/store_header.dart';
import 'widgets/store_product_card.dart';
import 'widgets/store_skeleton.dart';
import 'widgets/store_style.dart';

/// `?origem=` da página do produto aberta daqui (e o do `loja_add_carrinho`).
const String _origin = 'favoritos';

/// Loja · Favoritos (app 09 e 09b vazio, `/loja/favoritos`).
///
/// Lê os favoritos do MESMO catálogo da vitrine (nada de consulta nova); o
/// coração tira na hora e o card some. Regras em
/// `docs/business-rules/loja-favoritos.md` / `store_favorites_rules.dart`.
///
/// A busca do header devolve o resultado pra vitrine que abriu esta tela
/// (`pop` com o [StoreSearchResult]); sem vitrine embaixo, vai pra `/loja`.
class StoreFavoritesPage extends ConsumerStatefulWidget {
  const StoreFavoritesPage({super.key});

  @override
  ConsumerState<StoreFavoritesPage> createState() => _StoreFavoritesPageState();
}

class _StoreFavoritesPageState extends ConsumerState<StoreFavoritesPage> {
  /// Tirados agora, antes do servidor confirmar (otimista).
  final Set<String> _removed = {};

  /// Produtos com o "Adicionar" em curso (toque repetido não grava duas vezes).
  final Set<String> _adding = {};
  int _bagPulse = 0;
  bool _viewLogged = false;

  AnalyticsService get _analytics => ref.read(analyticsServiceProvider);

  @override
  void initState() {
    super.initState();
    ref.listenManual<StoreFavoritesView>(
      storeFavoritesProvider,
      (_, next) => _logView(next),
      fireImmediately: true,
    );
    // O stream alcançou a remoção: o id sai do otimista. Se o produto voltar
    // a ser favoritado (na página do produto), o card volta também.
    ref.listenManual<AsyncValue<StoreShopper>>(storeShopperProvider, (_, next) {
      final ids = next.valueOrNull?.favoriteIds;
      if (ids != null) _removed.removeWhere((id) => !ids.contains(id));
    });
  }

  void _logView(StoreFavoritesView next) {
    if (_viewLogged || next.status != StoreFavoritesStatus.ready) return;
    _viewLogged = true;
    _analytics.logStoreFavoritesView(total: next.products.length);
  }

  // ── Navegação ─────────────────────────────────────────────────────────

  void _back() => popOrGo(context, AppRoutes.store);

  void _openCart() => context.pushNamed(AppRouteNames.storeCart);

  void _openProduct(StoreProduct product) {
    context.pushNamed(
      AppRouteNames.storeProduct,
      pathParameters: {'productId': product.id},
      queryParameters: {'origem': _origin},
    );
  }

  Future<void> _openSearch() async {
    final result = await context.pushNamed<StoreSearchResult>(
      AppRouteNames.storeSearch,
    );
    if (result == null || !mounted) return;
    final query = result.query?.trim() ?? '';
    final categoryId = result.categoryId;
    if (categoryId == null && query.isEmpty) return;
    if (context.canPop()) {
      context.pop(result);
      return;
    }
    context.goNamed(
      AppRouteNames.store,
      queryParameters: {
        if (categoryId != null) 'categoria': categoryId,
        if (query.isNotEmpty) 'q': query,
      },
    );
  }

  void _retry() {
    ref.invalidate(storeCatalogProvider);
    ref.invalidate(storeShopperProvider);
  }

  // ── Card ──────────────────────────────────────────────────────────────

  Future<void> _unfavorite(StoreProduct product) async {
    setState(() => _removed.add(product.id));
    _analytics.logStoreFavorite(productId: product.id, on: false);
    try {
      await ref
          .read(storeActionsProvider)
          .toggleFavorite(product.id, on: false);
    } catch (_) {
      if (!mounted) return;
      setState(() => _removed.remove(product.id));
      showAppSnackBar(context, StoreCopy.favoriteError, isError: true);
    }
  }

  Future<void> _onAction(StoreProduct product) async {
    final action = storeFavoriteAction(product);
    switch (action.kind) {
      case StoreFavoriteActionKind.notifyMe:
        // A lista de espera ainda não existe: o mesmo aviso do produto.
        _analytics.logStoreNotifyMe(productId: product.id);
        showAppSnackBar(context, StoreCopy.waitlistSoon);
      case StoreFavoriteActionKind.customize:
        await _customize(product);
      case StoreFavoriteActionKind.addDirect:
        await _addDirect(product, action.variant!);
      case StoreFavoriteActionKind.viewOptions:
        _openProduct(product);
    }
  }

  /// Sem `sku`: a personalização usa a pré-seleção do produto. Volta `true`
  /// = a linha personalizada entrou no carrinho.
  Future<void> _customize(StoreProduct product) async {
    final added = await context.pushNamed<bool>(
      AppRouteNames.storeCustomize,
      pathParameters: {'productId': product.id},
    );
    if (added != true || !mounted) return;
    setState(() => _bagPulse++);
    _showAdded();
  }

  /// 1 unidade com a mesma soma e o mesmo teto da página do produto.
  Future<void> _addDirect(StoreProduct product, StoreVariant variant) async {
    if (!_adding.add(product.id)) return;
    try {
      final cap = storeVariantCap(variant);
      final cart =
          ref.read(storeCartProvider).valueOrNull ?? const <StoreCartItem>[];
      switch (storeCartAddBlock(
        cart,
        productId: product.id,
        skuId: variant.id,
        cap: cap,
      )) {
        case StoreCartAddBlock.lineAtMax:
          showAppSnackBar(context, StoreCopy.cartLineAtMax(cap));
          return;
        case StoreCartAddBlock.cartFull:
          showAppSnackBar(context, StoreCopy.cartFull, isError: true);
          return;
        case null:
          break;
      }
      final added = await ref.read(storeActionsProvider).addToCart(
            productId: product.id,
            skuId: variant.id,
            maxQty: cap,
          );
      if (!mounted) return;
      if (!added) {
        showAppSnackBar(context, StoreCopy.cartFull, isError: true);
        return;
      }
      _analytics.logStoreAddToCart(
        sku: variant.id,
        qty: 1,
        priceCents: variant.priceCents,
        origin: _origin,
      );
      setState(() => _bagPulse++);
      _showAdded();
    } catch (_) {
      if (mounted) showAppSnackBar(context, StoreCopy.addError, isError: true);
    } finally {
      _adding.remove(product.id);
    }
  }

  void _showAdded() {
    showStoreAddedSnackBar(
      context,
      message: StoreCopy.addedToCart,
      actionLabel: StoreCopy.see,
      onAction: _openCart,
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final view = ref.watch(storeFavoritesProvider);
    final favorites =
        view.products.where((p) => !_removed.contains(p.id)).toList();
    final ready = view.status == StoreFavoritesStatus.ready;

    final Widget body;
    switch (view.status) {
      case StoreFavoritesStatus.loading:
        body = const _FavoritesSkeleton();
      case StoreFavoritesStatus.error:
        body = AppErrorView(
          title: StoreCopy.favoritesErrorTitle,
          message: StoreCopy.errorMessage,
          retryLabel: StoreCopy.retry,
          onRetry: _retry,
        );
      case StoreFavoritesStatus.ready:
        body = favorites.isEmpty
            ? _FavoritesEmpty(onExplore: _back)
            : _grid(favorites);
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
        header: StoreHeader(
          title: StoreCopy.favoritesTitle,
          subtitle: ready && favorites.isNotEmpty
              ? StoreCopy.favoritesCount(favorites.length)
              : null,
          cartUnits: ref.watch(storeCartUnitsProvider),
          pulseTick: _bagPulse,
          onBack: _back,
          onSearch: _openSearch,
          onCart: _openCart,
        ),
        child: body,
      ),
    );
  }

  Widget _grid(List<StoreProduct> favorites) {
    final config = ref.watch(storeShowcaseConfigProvider).valueOrNull ??
        StoreShowcaseConfig.empty;
    final pixPct = config.benefits.pixDiscountPct;
    final highlight = storeFavoriteHighlight(favorites);
    final extent = StoreProductCard.extent(MediaQuery.textScalerOf(context));
    return CustomScrollView(
      slivers: [
        if (highlight != null)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              6,
              AppSpacing.screenH,
              16,
            ),
            sliver: SliverToBoxAdapter(
              child: _HighlightStrip(
                highlight: highlight,
                onTap: () => _openProduct(highlight.product),
              ),
            ),
          )
        else
          const SliverToBoxAdapter(child: SizedBox(height: 6)),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          sliver: SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: StoreStyle.gridGap,
              mainAxisSpacing: 18,
              mainAxisExtent: extent,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) {
                final product = favorites[i];
                return StoreFavoriteCard(
                  key: ValueKey('store-favorite-${product.id}'),
                  product: product,
                  pixDiscountPct: pixPct,
                  onTap: () => _openProduct(product),
                  onAction: () => _onAction(product),
                  onUnfavorite: () => _unfavorite(product),
                );
              },
              childCount: favorites.length,
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: AppSpacing.xxxl + MediaQuery.paddingOf(context).bottom,
          ),
        ),
      ],
    );
  }
}

/// Faixa verde: o favorito de maior desconto ("{nome} está R$ X mais
/// barato"). Tocar abre o produto.
class _HighlightStrip extends StatelessWidget {
  const _HighlightStrip({required this.highlight, required this.onTap});

  final StoreFavoriteHighlight highlight;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      key: const ValueKey('store-favorites-highlight'),
      color: AppColors.win.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: AppColors.win.withValues(alpha: 0.25)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              const Icon(Icons.sell_outlined, size: 18, color: AppColors.win),
              const SizedBox(width: 12),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: highlight.product.name,
                        style: TextStyle(
                          color: colors.onSurface,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      TextSpan(
                        text: StoreCopy.favoritesCheaper(
                          storeDiscountAmountLabel(highlight.cents),
                        ),
                      ),
                    ],
                  ),
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w400,
                    height: 1.35,
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: StoreStyle.tertiary(colors),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 09b: nada salvo (ou tudo fora do catálogo do canal).
class _FavoritesEmpty extends StatelessWidget {
  const _FavoritesEmpty({required this.onExplore});

  final VoidCallback onExplore;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return CustomScrollView(
      slivers: [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(36, 0, 36, 120),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.favorite_border_rounded,
                      size: 30,
                      color: AppColors.brand,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    StoreCopy.favoritesEmptyTitle,
                    textAlign: TextAlign.center,
                    style: AppTypography.soraRegular(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.44,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    StoreCopy.favoritesEmptyHint,
                    textAlign: TextAlign.center,
                    style: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                      height: 1.5,
                      color: StoreStyle.secondary(colors),
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    key: const ValueKey('store-favorites-explore'),
                    onPressed: onExplore,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: StoreStyle.onBrand,
                      minimumSize: const Size(0, 54),
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      shape: const RoundedRectangleBorder(
                        borderRadius: BorderRadius.all(Radius.circular(18)),
                      ),
                      textStyle: AppTypography.soraRegular(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.16,
                      ),
                    ),
                    child: const Text(StoreCopy.favoritesExplore),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Carregando: 4 cards no formato final.
class _FavoritesSkeleton extends StatelessWidget {
  const _FavoritesSkeleton();

  @override
  Widget build(BuildContext context) {
    final extent = StoreProductCard.extent(MediaQuery.textScalerOf(context));
    return CustomScrollView(
      physics: const NeverScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            6,
            AppSpacing.screenH,
            0,
          ),
          sliver: SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: StoreStyle.gridGap,
              mainAxisSpacing: 18,
              mainAxisExtent: extent,
            ),
            delegate: SliverChildBuilderDelegate(
              (_, _) => const StoreProductCardSkeleton(),
              childCount: 4,
            ),
          ),
        ),
      ],
    );
  }
}
