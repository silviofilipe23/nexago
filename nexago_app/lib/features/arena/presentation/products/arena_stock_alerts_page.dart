import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/arena_providers.dart';
import '../../domain/products/arena_product.dart';
import '../../domain/products/arena_product_logic.dart';
import '../../domain/products/arena_product_providers.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';

class ArenaStockAlertsPage extends ConsumerWidget {
  const ArenaStockAlertsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managed = ref.watch(managedArenaIdProvider);
    final arenaDetail = ref.watch(managedArenaDetailProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: FadeSlideIn(
          child: managed.when(
            data: (arenaId) {
              if (arenaId == null || arenaId.isEmpty) {
                return const ArenaEmptyState(
                  title: 'Arena não encontrada',
                  message: 'Nenhuma arena vinculada.',
                  icon: Icons.inventory_2_outlined,
                );
              }
              return _StockBody(
                arenaId: arenaId,
                arenaName: arenaDetail.valueOrNull?.name,
              );
            },
            loading: () =>
                const ArenaLoadingState(label: 'Carregando estoque...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }
}

class _StockBody extends ConsumerWidget {
  const _StockBody({
    required this.arenaId,
    required this.arenaName,
  });

  final String arenaId;
  final String? arenaName;

  void _refresh(WidgetRef ref) {
    ref.invalidate(arenaProductsStreamProvider(arenaId));
    ref.invalidate(arenaStockTurnover7dProvider(arenaId));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(arenaProductSummaryProvider(arenaId));
    final alerts = ref.watch(arenaStockAlertsProvider(arenaId));
    final turnoverAsync = ref.watch(arenaStockTurnover7dProvider(arenaId));

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              ArenaDashboardTokens.horizontalPadding,
              8,
              ArenaDashboardTokens.horizontalPadding,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _StockHeader(
                  arenaName: arenaName,
                  onBack: () {
                    if (context.canPop()) {
                      context.pop();
                    } else {
                      context.goNamed(AppRouteNames.arenaProducts);
                    }
                  },
                  onRefresh: () => _refresh(ref),
                ),
                const SizedBox(height: 20),
                _StockSummaryCard(
                  inventoryValue: formatInventoryValueReais(
                    summary.inventoryValueCents,
                  ),
                  turnoverAsync: turnoverAsync,
                ),
                const SizedBox(height: 24),
                const _OutSectionTitle(),
              ],
            ),
          ),
        ),
        if (alerts.out.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
              child: Text(
                'Nenhum produto esgotado.',
                style: TextStyle(
                  color: context.themeColors.onSurfaceMuted,
                  fontSize: 13,
                ),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            sliver: SliverList.separated(
              itemCount: alerts.out.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) => _AlertRow(
                product: alerts.out[index],
                onRestock: () => _openRestock(context, alerts.out[index].id),
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
            child: _LowSectionTitle(count: alerts.low.length),
          ),
        ),
        if (alerts.low.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
              child: Text(
                'Nenhum alerta de estoque baixo.',
                style: TextStyle(
                  color: context.themeColors.onSurfaceMuted,
                  fontSize: 13,
                ),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
            sliver: SliverList.separated(
              itemCount: alerts.low.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) => _AlertRow(
                product: alerts.low[index],
                onRestock: () => _openRestock(context, alerts.low[index].id),
              ),
            ),
          ),
      ],
    );
  }

  void _openRestock(BuildContext context, String productId) {
    context.pushNamed(
      AppRouteNames.arenaProductRestock,
      pathParameters: {'productId': productId},
    );
  }
}

class _StockHeader extends StatelessWidget {
  const _StockHeader({
    required this.arenaName,
    required this.onBack,
    required this.onRefresh,
  });

  final String? arenaName;
  final VoidCallback onBack;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = arenaName == null || arenaName!.isEmpty
        ? 'GESTOR • ARENA'
        : 'GESTOR • ${arenaName!.toUpperCase()}';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onBack,
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                Icons.arrow_back_rounded,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.mono(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Estoque',
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: context.themeColors.onSurface,
                  fontSize: 26,
                  height: 1.05,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onRefresh,
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                Icons.refresh_rounded,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _StockSummaryCard extends StatelessWidget {
  const _StockSummaryCard({
    required this.inventoryValue,
    required this.turnoverAsync,
  });

  final String inventoryValue;
  final AsyncValue<int> turnoverAsync;

  @override
  Widget build(BuildContext context) {
    final turnoverLabel = turnoverAsync.when(
      data: (turnover) => '▲ $turnover un',
      loading: () => '...',
      error: (_, __) => '—',
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Row(
        children: [
          Expanded(
            child: _SummaryMetric(
              label: 'VALOR EM ESTOQUE',
              value: inventoryValue,
            ),
          ),
          Container(
            width: 1,
            height: 44,
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
          ),
          Expanded(
            child: _SummaryMetric(
              label: 'GIRO 7D',
              value: turnoverLabel,
              valueColor: turnoverAsync.hasValue ? AppColors.win : null,
              alignEnd: true,
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({
    required this.label,
    required this.value,
    this.valueColor,
    this.alignEnd = false,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          value,
          style: AppTypography.soraRegular(
            color: valueColor ?? context.themeColors.onSurface,
            fontSize: 18,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),
      ],
    );
  }
}

class _OutSectionTitle extends StatelessWidget {
  const _OutSectionTitle();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          'Esgotado',
          style: TextStyle(
            color: context.themeColors.onSurface,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.live.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            'bloqueia venda',
            style: AppTypography.mono(
              color: AppColors.live,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
        ),
      ],
    );
  }
}

class _LowSectionTitle extends StatelessWidget {
  const _LowSectionTitle({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          'Estoque baixo',
          style: TextStyle(
            color: context.themeColors.onSurface,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        if (count > 0) ...[
          const SizedBox(width: 8),
          Text(
            '$count',
            style: TextStyle(
              color: AppColors.pending,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ],
    );
  }
}

class _AlertRow extends StatelessWidget {
  const _AlertRow({
    required this.product,
    required this.onRestock,
  });

  final ArenaProduct product;
  final VoidCallback onRestock;

  @override
  Widget build(BuildContext context) {
    final status = productStockStatus(product);
    final isOut = status == ArenaProductStockStatus.out;
    final stockColor = isOut ? AppColors.live : AppColors.pending;
    final emoji = product.emoji?.trim();
    final imageUrl = product.imageUrl?.trim();

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.12,
                  ),
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: imageUrl != null && imageUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                    )
                  : Center(
                      child: Text(
                        emoji == null || emoji.isEmpty ? '📦' : emoji,
                        style: const TextStyle(fontSize: 24),
                      ),
                    ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: context.themeColors.onSurface,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '● ${product.stockQuantity} un • mín ${product.minStockQuantity}',
                    style: AppTypography.mono(
                      color: stockColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (isOut)
              FilledButton(
                onPressed: onRestock,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 12,
                  ),
                  minimumSize: const Size(0, 44),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Repor',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              )
            else
              OutlinedButton(
                onPressed: onRestock,
                style: OutlinedButton.styleFrom(
                  foregroundColor: context.themeColors.onSurface,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 12,
                  ),
                  minimumSize: const Size(0, 44),
                  side: BorderSide(
                    color: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.35,
                    ),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Repor',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
