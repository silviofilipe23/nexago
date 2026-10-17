import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../application/store_providers.dart';
import '../domain/store_models.dart';
import '../domain/store_rules.dart';
import 'store_copy.dart';
import 'widgets/store_header.dart';
import 'widgets/store_style.dart';

/// O que a busca devolve pra vitrine: um termo (vazio = limpar a busca) ou
/// uma categoria escolhida nas sugestões.
class StoreSearchResult {
  const StoreSearchResult.query(this.query) : categoryId = null;
  const StoreSearchResult.category(this.categoryId) : query = null;

  final String? query;
  final String? categoryId;
}

/// Busca da Loja em tela cheia: buscas recentes com o campo vazio,
/// sugestões a partir de 2 caracteres e Enter volta pra vitrine filtrada.
class StoreSearchPage extends ConsumerStatefulWidget {
  const StoreSearchPage({super.key, this.initialQuery = ''});

  final String initialQuery;

  @override
  ConsumerState<StoreSearchPage> createState() => _StoreSearchPageState();
}

class _StoreSearchPageState extends ConsumerState<StoreSearchPage> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialQuery);

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit(String raw) {
    final term = raw.trim();
    if (term.isNotEmpty) {
      final products =
          ref.read(storeCatalogProvider).valueOrNull?.products ?? const [];
      final config = ref.read(storeShowcaseConfigProvider).valueOrNull ??
          StoreShowcaseConfig.empty;
      final results =
          products.where((p) => matchesStoreSearch(p, term, config)).length;
      ref.read(analyticsServiceProvider).logStoreSearch(
            term: term,
            results: results,
          );
      ref.read(storeActionsProvider).rememberSearch(term);
    }
    context.pop(StoreSearchResult.query(term));
  }

  void _openProduct(StoreProduct product, int position) {
    ref.read(analyticsServiceProvider).logStoreProductClick(
          productId: product.id,
          position: position,
        );
    context.pushNamed(
      AppRouteNames.storeProduct,
      pathParameters: {'productId': product.id},
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final text = _controller.text;
    final products =
        ref.watch(storeCatalogProvider).valueOrNull?.products ?? const [];
    final config = ref.watch(storeShowcaseConfigProvider).valueOrNull ??
        StoreShowcaseConfig.empty;
    final recent =
        ref.watch(storeShopperProvider).valueOrNull?.recentSearches ??
            const <String>[];
    final pixPct = config.benefits.pixDiscountPct;
    final typing =
        normalizeStoreSearch(text).length >= kStoreSuggestionMinChars;
    final suggestions = storeSearchSuggestions(products, config, text);

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
              onTap: () => context.pop(),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _controller,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onSubmitted: _submit,
                style: AppTypography.bodyM.copyWith(color: colors.onSurface),
                decoration: InputDecoration(
                  hintText: StoreCopy.searchHint,
                  hintStyle: AppTypography.bodyM.copyWith(
                    color: StoreStyle.tertiary(colors),
                  ),
                  isDense: true,
                  filled: true,
                  fillColor: StoreStyle.surface(colors),
                  contentPadding: const EdgeInsets.symmetric(vertical: 13),
                  prefixIcon: Icon(
                    Icons.search_rounded,
                    size: 20,
                    color: StoreStyle.secondary(colors),
                  ),
                  suffixIcon: text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: StoreCopy.clearSearch,
                          icon: const Icon(Icons.close_rounded, size: 18),
                          onPressed: _controller.clear,
                        ),
                  border: const OutlineInputBorder(
                    borderRadius: AppRadii.pillAll,
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
          ],
        ),
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            if (!typing && recent.isNotEmpty) ...[
              const _Label(StoreCopy.recentSearches),
              for (final term in recent)
                _Row(
                  leading: Icon(
                    Icons.history_rounded,
                    size: 20,
                    color: StoreStyle.tertiary(colors),
                  ),
                  title: term,
                  onTap: () => _submit(term),
                ),
            ],
            if (typing && suggestions.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.lg),
                child: Text(
                  StoreCopy.noSuggestions,
                  style: AppTypography.bodyS.copyWith(
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ),
            if (typing && suggestions.products.isNotEmpty) ...[
              const _Label(StoreCopy.suggestionsProducts),
              for (var i = 0; i < suggestions.products.length; i++)
                _ProductRow(
                  product: suggestions.products[i],
                  pixDiscountPct: pixPct,
                  onTap: () => _openProduct(suggestions.products[i], i + 1),
                ),
            ],
            if (typing && suggestions.categories.isNotEmpty) ...[
              const _Label(StoreCopy.suggestionsCategories),
              for (final category in suggestions.categories)
                _Row(
                  leading: Icon(
                    Icons.grid_view_rounded,
                    size: 20,
                    color: StoreStyle.tertiary(colors),
                  ),
                  title: StoreCopy.categorySuggestion(category.label),
                  onTap: () =>
                      context.pop(StoreSearchResult.category(category.id)),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
      child: Text(
        text,
        style: AppTypography.eyebrow.copyWith(
          color: StoreStyle.tertiary(context.themeColors),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.leading, required this.title, required this.onTap});

  final Widget leading;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadii.mdAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            leading,
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.bodyM.copyWith(color: colors.onSurface),
              ),
            ),
            Icon(
              Icons.north_west_rounded,
              size: 16,
              color: StoreStyle.tertiary(colors),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({
    required this.product,
    required this.onTap,
    this.pixDiscountPct,
  });

  final StoreProduct product;
  final num? pixDiscountPct;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final url = product.coverUrl;
    final price = displayPriceCents(product);
    const striped = StoreStripedBox();
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadii.mdAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: AppRadii.mdAll,
              child: SizedBox.square(
                dimension: 48,
                child: url == null
                    ? striped
                    : CachedNetworkImage(
                        imageUrl: url,
                        fit: BoxFit.cover,
                        memCacheHeight:
                            (48 * MediaQuery.devicePixelRatioOf(context))
                                .round(),
                        placeholder: (_, _) => striped,
                        errorWidget: (_, _, _) => striped,
                      ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.titleS.copyWith(
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text.rich(
                    TextSpan(
                      children: [
                        if (priceVaries(product))
                          const TextSpan(text: StoreCopy.fromPrefix),
                        TextSpan(
                          text: StoreCopy.price(price),
                          style: TextStyle(
                            color: colors.onSurface,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (pixDiscountPct != null) ...[
                          const TextSpan(text: ' · '),
                          TextSpan(
                            text: StoreCopy.price(
                              pixPriceCents(price, pixDiscountPct!),
                            ),
                            style: const TextStyle(color: AppColors.brand),
                          ),
                          const TextSpan(text: StoreCopy.pixSuffix),
                        ],
                      ],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      color: StoreStyle.tertiary(colors),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
