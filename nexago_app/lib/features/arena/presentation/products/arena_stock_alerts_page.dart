import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/arena_providers.dart';
import '../../domain/products/arena_product.dart';
import '../../domain/products/arena_product_logic.dart';
import '../../domain/products/arena_product_providers.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_stock_status_badge.dart';

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
                _Header(
                  arenaName: arenaName,
                  onBack: () => context.pop(),
                ),
                const SizedBox(height: 20),
                Text(
                  'Estoque',
                  style: TextStyle(
                    color: context.themeColors.onSurface,
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _MetricCard(
                        label: 'Valor em estoque',
                        value: formatInventoryValueReais(
                          summary.inventoryValueCents,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: turnoverAsync.when(
                        data: (turnover) => _MetricCard(
                          label: 'Giro 7d',
                          value: '▲ $turnover un',
                          valueColor: AppColors.win,
                        ),
                        loading: () => _MetricCard(
                          label: 'Giro 7d',
                          value: '...',
                        ),
                        error: (_, __) => _MetricCard(
                          label: 'Giro 7d',
                          value: '—',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionTitle(
                  title: 'Esgotado',
                  subtitle: 'bloqueia venda',
                  count: alerts.out.length,
                  accent: AppColors.live,
                ),
              ],
            ),
          ),
        ),
        if (alerts.out.isEmpty)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Text('Nenhum produto esgotado.'),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
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
            child: _SectionTitle(
              title: 'Estoque baixo',
              count: alerts.low.length,
              accent: AppColors.pending,
            ),
          ),
        ),
        if (alerts.low.isEmpty)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Text('Nenhum alerta de estoque baixo.'),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
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
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Text(
              product.emoji == null || product.emoji!.isEmpty
                  ? '📦'
                  : product.emoji!,
              style: const TextStyle(fontSize: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    style: TextStyle(
                      color: context.themeColors.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${product.stockQuantity} un · mín ${product.minStockQuantity}',
                    style: TextStyle(
                      color: context.themeColors.onSurfaceMuted,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            if (status == ArenaProductStockStatus.out)
              const Padding(
                padding: EdgeInsets.only(right: 8),
                child: ArenaStockStatusBadge.outOfStock(),
              ),
            TextButton(
              onPressed: onRestock,
              child: const Text('Repor'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              color: valueColor ?? context.themeColors.onSurface,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.title,
    required this.count,
    required this.accent,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final int count;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: TextStyle(
            color: context.themeColors.onSurface,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(width: 8),
          Text(
            subtitle!,
            style: TextStyle(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 13,
            ),
          ),
        ],
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            '$count',
            style: TextStyle(
              color: accent,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.arenaName,
    required this.onBack,
  });

  final String? arenaName;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onBack,
            child: const SizedBox(
              width: 44,
              height: 44,
              child: Icon(Icons.arrow_back_rounded),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            arenaName == null || arenaName!.isEmpty
                ? 'GESTOR · ARENA'
                : 'GESTOR · ${arenaName!.toUpperCase()}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
        ),
      ],
    );
  }
}
