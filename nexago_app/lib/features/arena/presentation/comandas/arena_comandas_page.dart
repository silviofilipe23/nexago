import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_floating_header.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';

import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_shell_providers.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import '../widgets/arena_async_state.dart';
import '../widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_comanda_card.dart';
import 'widgets/arena_comanda_filter_chips.dart';
import 'widgets/arena_comanda_kpi_row.dart';

class ArenaComandasPage extends ConsumerWidget {
  const ArenaComandasPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final managed = ref.watch(managedArenaIdProvider);
    final arenaDetail = ref.watch(managedArenaDetailProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      floatingActionButton: managed.maybeWhen(
        data: (arenaId) {
          if (arenaId == null || arenaId.isEmpty) return null;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: FloatingActionButton.extended(
              onPressed: () {
                ref.read(arenaComandaDraftProvider.notifier).reset();
                context.pushNamed(AppRouteNames.arenaComandaNewType);
              },
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              icon: const Icon(Icons.add_rounded),
              label: const Text(
                'Nova',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          );
        },
        orElse: () => null,
      ),
      body: SafeArea(
        child: FadeSlideIn(
          child: managed.when(
            data: (arenaId) {
              if (arenaId == null || arenaId.isEmpty) {
                return const ArenaEmptyState(
                  title: 'Arena não encontrada',
                  message: 'Nenhuma arena vinculada ao seu usuário.',
                  icon: Icons.receipt_long_outlined,
                );
              }
              return _ComandasBody(
                arenaId: arenaId,
                arenaName: arenaDetail.valueOrNull?.name,
              );
            },
            loading: () =>
                const ArenaLoadingState(label: 'Carregando comandas...'),
            error: (e, _) => ArenaErrorState(message: '$e'),
          ),
        ),
      ),
    );
  }
}

class _ComandasBody extends ConsumerWidget {
  const _ComandasBody({
    required this.arenaId,
    required this.arenaName,
  });

  final String arenaId;
  final String? arenaName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comandasAsync = ref.watch(arenaComandasStreamProvider(arenaId));
    final filtered = ref.watch(arenaComandasFilteredProvider(arenaId));
    final kpis = ref.watch(arenaComandasKpisProvider(arenaId));

    return comandasAsync.when(
      data: (_) {
        return CustomScrollView(
          controller:
              ref.watch(arenaShellScrollRegistryProvider).controllerFor(2),
          key: const PageStorageKey<String>('arena-comandas-scroll'),
          slivers: [
            NexaFloatingHeaderSliver(
              topGap: 8,
              padding: const EdgeInsets.symmetric(
                horizontal: ArenaDashboardTokens.horizontalPadding,
              ),
              child: _ComandasHeader(
                arenaName: arenaName,
                onSearch: () {
                  showAppSnackBar(context, 'Busca em breve.');
                },
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  ArenaDashboardTokens.horizontalPadding,
                  20,
                  ArenaDashboardTokens.horizontalPadding,
                  0,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ArenaComandaKpiRow(arenaId: arenaId),
                    const SizedBox(height: 16),
                    ArenaComandaFilterChips(openCount: kpis.openCount),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
            if (filtered.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: ArenaEmptyState(
                    title: 'Nenhuma comanda aberta',
                    message: kpis.openCount == 0
                        ? 'Toque em Nova para abrir a primeira comanda.'
                        : 'Nenhuma comanda neste filtro.',
                    icon: Icons.receipt_long_outlined,
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  ArenaDashboardTokens.horizontalPadding,
                  0,
                  ArenaDashboardTokens.horizontalPadding,
                  96,
                ),
                sliver: SliverList.separated(
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final comanda = filtered[index];
                    return ArenaComandaCard(
                      comanda: comanda,
                      onTap: () {
                        context.pushNamed(
                          AppRouteNames.arenaComandaDetail,
                          pathParameters: {'comandaId': comanda.id},
                        );
                      },
                    );
                  },
                ),
              ),
          ],
        );
      },
      loading: () => const ArenaLoadingState(label: 'Carregando comandas...'),
      error: (e, _) => ArenaErrorState(message: '$e'),
    );
  }
}

class _ComandasHeader extends StatelessWidget {
  const _ComandasHeader({
    required this.arenaName,
    required this.onSearch,
  });

  final String? arenaName;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = arenaName?.trim().isNotEmpty == true
        ? arenaName!.trim().toUpperCase()
        : 'ARENA';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'GESTOR · $label',
                style: AppTypography.mono(
                  color: AppColors.brand,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Comandas',
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
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onSearch,
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                Icons.search_rounded,
                color: context.themeColors.onSurface,
                size: 22,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
