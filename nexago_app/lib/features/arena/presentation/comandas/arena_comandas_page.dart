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

import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_shell_providers.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import '../plan/widgets/arena_plan_gate.dart';
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
              final entitled = ref
                  .watch(managedArenaCapabilitiesProvider)
                  .contains(ArenaCapability.pdvComandas);
              return _ComandasBody(
                arenaId: arenaId,
                arenaName: arenaDetail.valueOrNull?.name,
                entitled: entitled,
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
    required this.entitled,
  });

  final String arenaId;
  final String? arenaName;
  final bool entitled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comandasAsync = ref.watch(arenaComandasStreamProvider(arenaId));
    final filtered = ref.watch(arenaComandasFilteredProvider(arenaId));
    final kpis = ref.watch(arenaComandasKpisProvider(arenaId));

    return comandasAsync.when(
      data: (allComandas) {
        // Sem titularidade e sem histórico: paywall (nada a preservar).
        if (!entitled && allComandas.isEmpty) {
          return const ArenaPlanUpsell(
            capability: ArenaCapability.pdvComandas,
          );
        }
        return CustomScrollView(
          controller: ref
              .watch(arenaShellScrollRegistryProvider)
              .controllerFor(2),
          key: const PageStorageKey<String>('arena-comandas-scroll'),
          slivers: [
            NexaFloatingHeaderSliver(
              topGap: 8,
              padding: const EdgeInsets.symmetric(
                horizontal: ArenaDashboardTokens.horizontalPadding,
              ),
              child: _ComandasHeader(
                arenaName: arenaName,
                onNewComanda: () {
                  if (!entitled) {
                    showArenaPlanUpsellSheet(
                      context,
                      capability: ArenaCapability.pdvComandas,
                    );
                    return;
                  }
                  ref.read(arenaComandaDraftProvider.notifier).reset();
                  context.pushNamed(AppRouteNames.arenaComandaNewType);
                },
                onSearch: () {
                  showAppSnackBar(context, 'Busca em breve.');
                },
              ),
            ),
            if (!entitled)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    12,
                    ArenaDashboardTokens.horizontalPadding,
                    0,
                  ),
                  child: const ArenaPlanReadOnlyBanner(
                    message: 'Somente leitura. Você pode fechar as comandas '
                        'abertas, mas não abrir novas.',
                  ),
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
                padding: EdgeInsets.fromLTRB(
                  ArenaDashboardTokens.horizontalPadding,
                  0,
                  ArenaDashboardTokens.horizontalPadding,
                  ArenaDashboardTokens.shellScrollBottomPadding(context),
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
    required this.onNewComanda,
    required this.onSearch,
  });

  final String? arenaName;
  final VoidCallback onNewComanda;
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
        const SizedBox(width: 8),
        Material(
          color: AppColors.brand,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onNewComanda,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                height: 44,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.add_rounded,
                      color: AppColors.black,
                      size: 20,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Nova',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: AppColors.black,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
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
