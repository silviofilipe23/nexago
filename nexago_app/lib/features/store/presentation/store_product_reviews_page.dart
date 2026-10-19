import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/layout/nexa_page_header.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/store_providers.dart';
import '../application/store_review_providers.dart';
import '../domain/store_models.dart';
import '../domain/store_review_models.dart';
import '../domain/store_review_rules.dart';
import 'store_review_copy.dart';
import 'widgets/store_checkout_parts.dart';
import 'widgets/store_review_parts.dart';
import 'widgets/store_style.dart';

/// Loja · Avaliações do produto (`/loja/produto/:productId/avaliacoes`):
/// resumo, caimento, filtros, ordem e a lista inteira (as 100 mais
/// recentes). O resumo vem do agregado do espelho do produto; as contagens
/// dos filtros, da lista carregada.
class StoreProductReviewsPage extends ConsumerStatefulWidget {
  const StoreProductReviewsPage({
    super.key,
    required this.productId,
    this.sizeValueId,
    this.clock,
  });

  final String productId;

  /// Tamanho escolhido na página do produto (filtro "Tamanho M").
  final String? sizeValueId;

  /// Relógio injetável (datas dos cards); padrão: agora.
  final DateTime Function()? clock;

  @override
  ConsumerState<StoreProductReviewsPage> createState() =>
      _StoreProductReviewsPageState();
}

class _StoreProductReviewsPageState
    extends ConsumerState<StoreProductReviewsPage> {
  StoreReviewFilterKind _filter = StoreReviewFilterKind.all;
  StoreReviewSort _sort = StoreReviewSort.recent;

  DateTime get _now => widget.clock?.call() ?? DateTime.now();

  void _back() => popOrGo(context, AppRoutes.store);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final lookup = ref.watch(storeProductProvider(widget.productId));
    final product = lookup.product;
    final productId = product?.id ?? widget.productId;
    final async = ref.watch(storeProductReviewsProvider(productId));
    final reviews = async.valueOrNull;

    final Widget body;
    if (reviews == null && async.hasError) {
      body = AppErrorView(
        title: StoreReviewCopy.reviewsLoadError,
        message: StoreReviewCopy.loadErrorBody,
        retryLabel: StoreReviewCopy.retry,
        onRetry: () => ref.invalidate(storeProductReviewsProvider(productId)),
      );
    } else if (reviews == null) {
      body = const Center(child: CircularProgressIndicator());
    } else {
      body = _content(colors, product, reviews);
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
        header: StoreTitleHeader(
          title: StoreReviewCopy.sectionTitle,
          subtitle: product?.name,
          onBack: _back,
        ),
        child: body,
      ),
    );
  }

  Widget _content(
    AppThemeColors colors,
    StoreProduct? product,
    List<StorePublicReview> reviews,
  ) {
    final sizeAxis = storeReviewSizeAxis(product);
    final sizeValueId = sizeAxis == null ? null : widget.sizeValueId;
    String? sizeLabel;
    for (final v in sizeAxis?.values ?? const <StoreAxisValue>[]) {
      if (v.id == sizeValueId) sizeLabel = v.label;
    }
    final summary = product == null ? null : storeReviewSummary(product);
    final fit = product == null
        ? null
        : storeReviewFitBar(product.reviewStats, sized: sizeAxis != null);
    final options = storeReviewFilterOptions(
      reviews,
      sizeValueId: sizeLabel == null ? null : sizeValueId,
      sizeLabel: sizeLabel,
    );
    // O filtro escolhido pode sumir (o tamanho saiu da lista): volta pra todas.
    final filter = options.any((o) => o.kind == _filter)
        ? _filter
        : StoreReviewFilterKind.all;
    final shown = storeReviewsView(
      reviews,
      filter: filter,
      sizeValueId: sizeValueId,
      sort: _sort,
    );
    final now = _now;

    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            6,
            AppSpacing.screenH,
            0,
          ),
          sliver: SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (summary != null) ...[
                  StoreReviewSummaryBlock(summary: summary),
                  const SizedBox(height: 22),
                ],
                if (fit != null) ...[
                  StoreReviewFitBarView(bar: fit),
                  const SizedBox(height: 22),
                ],
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: StoreStyle.surface(colors),
                    borderRadius: AppRadii.lgAll,
                  ),
                  child: Text(
                    StoreReviewCopy.onlyBuyersNote,
                    style: AppTypography.soraRegular(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w400,
                      height: 1.5,
                      color: StoreStyle.secondary(colors),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
        if (reviews.isEmpty)
          const SliverPadding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
            sliver: SliverToBoxAdapter(child: StoreReviewsEmpty()),
          )
        else ...[
          SliverToBoxAdapter(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenH,
              ),
              child: Row(
                children: [
                  for (var i = 0; i < options.length; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    _FilterChip(
                      key: ValueKey(
                        'store-reviews-filter-${options[i].kind.name}',
                      ),
                      label: options[i].label,
                      count: options[i].count,
                      selected: options[i].kind == filter,
                      onTap: () => setState(() => _filter = options[i].kind),
                    ),
                  ],
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              6,
              AppSpacing.screenH,
              0,
            ),
            sliver: SliverToBoxAdapter(
              child: Align(
                alignment: Alignment.centerRight,
                child: PopupMenuButton<StoreReviewSort>(
                  key: const ValueKey('store-reviews-sort'),
                  tooltip: StoreReviewCopy.sortTooltip,
                  initialValue: _sort,
                  color: colors.surfaceSheet,
                  onSelected: (s) => setState(() => _sort = s),
                  itemBuilder: (_) => [
                    for (final s in StoreReviewSort.values)
                      PopupMenuItem(
                        value: s,
                        child: Text(
                          s.label,
                          style: AppTypography.bodyM.copyWith(
                            color: colors.onSurface,
                            fontWeight: s == _sort
                                ? FontWeight.w700
                                : FontWeight.w400,
                          ),
                        ),
                      ),
                  ],
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _sort.label,
                          style: AppTypography.soraRegular(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: StoreStyle.secondary(colors),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Icon(
                          Icons.keyboard_arrow_down_rounded,
                          size: 18,
                          color: StoreStyle.secondary(colors),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (shown.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  StoreReviewCopy.noneWithFilter,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS.copyWith(
                    color: StoreStyle.secondary(colors),
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenH,
              ),
              sliver: SliverList.builder(
                itemCount: shown.length,
                itemBuilder: (_, i) => StoreReviewCard(
                  key: ValueKey('store-review-${shown[i].id}'),
                  review: shown[i],
                  now: now,
                ),
              ),
            ),
        ],
        SliverToBoxAdapter(
          child: SizedBox(
            height: AppSpacing.xxxl + MediaQuery.paddingOf(context).bottom,
          ),
        ),
      ],
    );
  }
}

/// Chip do filtro (o mesmo traço do filtro de "Meus pedidos").
class _FilterChip extends StatelessWidget {
  const _FilterChip({
    super.key,
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected ? colors.canvas : StoreStyle.secondary(colors);
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? colors.onSurface : Colors.transparent,
        shape: StadiumBorder(
          side: BorderSide(
            color: selected
                ? colors.onSurface
                : StoreCheckoutStyle.line(colors),
          ),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            alignment: Alignment.center,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: AppTypography.soraRegular(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: fg,
                  ),
                ),
                const SizedBox(width: 7),
                Text(
                  '$count',
                  style: AppTypography.mono(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: fg.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
