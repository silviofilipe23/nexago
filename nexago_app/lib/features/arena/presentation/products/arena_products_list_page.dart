import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/arena_providers.dart';
import '../../domain/products/arena_product_providers.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_product_card.dart';
import 'widgets/arena_product_category_chips.dart';
import 'widgets/arena_product_summary_row.dart';

class ArenaProductsListPage extends ConsumerWidget {
  const ArenaProductsListPage({super.key});

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
                  message: 'Nenhuma arena vinculada ao seu usuário.',
                  icon: Icons.inventory_2_outlined,
                );
              }
              return _ProductsBody(
                arenaId: arenaId,
                arenaName: arenaDetail.valueOrNull?.name,
              );
            },
            loading: () =>
                const ArenaLoadingState(label: 'Carregando produtos...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }
}

class _ProductsBody extends ConsumerWidget {
  const _ProductsBody({required this.arenaId, required this.arenaName});

  final String arenaId;
  final String? arenaName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productsAsync = ref.watch(arenaProductsStreamProvider(arenaId));
    final filtered = ref.watch(arenaProductsFilteredProvider(arenaId));
    final summary = ref.watch(arenaProductSummaryProvider(arenaId));
    final selectedCategory = ref.watch(arenaProductsCategoryFilterProvider);

    return productsAsync.when(
      data: (_) {
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
                    _ProductsHeader(
                      arenaName: arenaName,
                      onBack: () {
                        if (context.canPop()) {
                          context.pop();
                        } else {
                          context.goNamed(AppRouteNames.arenaSettings);
                        }
                      },
                      onStock: () =>
                          context.pushNamed(AppRouteNames.arenaProductStock),
                      onAdd: () =>
                          context.pushNamed(AppRouteNames.arenaProductNew),
                    ),
                    const SizedBox(height: 20),
                    ArenaProductSummaryRow(summary: summary),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ArenaProductCategoryChips(
                            selected: selectedCategory,
                            onSelected: (category) {
                              ref
                                      .read(
                                        arenaProductsCategoryFilterProvider
                                            .notifier,
                                      )
                                      .state =
                                  category;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
            if (filtered.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: ArenaEmptyState(
                  title: 'Nenhum produto',
                  message: selectedCategory == null
                      ? 'Cadastre o primeiro item da cantina.'
                      : 'Nenhum produto nesta categoria.',
                  icon: Icons.local_bar_outlined,
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  ArenaDashboardTokens.horizontalPadding,
                  0,
                  ArenaDashboardTokens.horizontalPadding,
                  32,
                ),
                sliver: SliverList.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final product = filtered[index];
                    return ArenaProductCard(
                      product: product,
                      onTap: () => context.pushNamed(
                        AppRouteNames.arenaProductEdit,
                        pathParameters: {'productId': product.id},
                      ),
                    );
                  },
                ),
              ),
          ],
        );
      },
      loading: () => const ArenaLoadingState(label: 'Carregando produtos...'),
      error: (e, _) => ArenaErrorState(message: '$e'),
    );
  }
}

class _ProductsHeader extends StatelessWidget {
  const _ProductsHeader({
    required this.arenaName,
    required this.onBack,
    required this.onStock,
    required this.onAdd,
  });

  final String? arenaName;
  final VoidCallback onBack;
  final VoidCallback onStock;
  final VoidCallback onAdd;

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
                'Produtos',
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
        const SizedBox(width: 8),
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onStock,
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                Icons.inventory_2_outlined,
                color: context.themeColors.onSurface,
                size: 22,
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Material(
          color: AppColors.brand,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onAdd,
            borderRadius: BorderRadius.circular(12),
            child: const SizedBox(
              width: 44,
              height: 44,
              child: Icon(Icons.add_rounded, color: AppColors.black, size: 26),
            ),
          ),
        ),
      ],
    );
  }
}
