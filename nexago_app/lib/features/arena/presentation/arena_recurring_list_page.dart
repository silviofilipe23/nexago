import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_plan.dart';
import '../domain/arena_recurring_booking.dart';
import '../domain/arena_recurring_providers.dart';
import '../domain/arena_schedule_providers.dart';
import 'plan/widgets/arena_plan_gate.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Horários fixos (mensalistas) ativos da arena gerida.
class ArenaRecurringListPage extends ConsumerWidget {
  const ArenaRecurringListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seriesAsync = ref.watch(arenaActiveRecurringSeriesProvider);
    final canAdd = ref.watch(managedArenaCanAddRecurringBookingProvider);
    final maxSeries = ref.watch(managedArenaMaxRecurringBookingsProvider);
    final arenaName = ref.watch(managedArenaDetailProvider).valueOrNull?.name;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _RecurringListHeader(
              arenaName: arenaName,
              onBack: () => context.pop(),
              onAdd: () => _onAdd(
                context,
                ref,
                canAdd: canAdd,
                max: maxSeries,
              ),
            ),
            Expanded(
              child: seriesAsync.when(
                data: (series) {
                  if (series.isEmpty) {
                    return const ArenaEmptyState(
                      title: 'Nenhum horário fixo',
                      message:
                          'Crie um horário fixo para reservar a mesma quadra '
                          'toda semana para um mensalista.',
                      icon: Icons.event_repeat_rounded,
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(
                      ArenaDashboardTokens.horizontalPadding,
                      16,
                      ArenaDashboardTokens.horizontalPadding,
                      32,
                    ),
                    itemCount: series.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) => FadeSlideIn(
                      duration: Duration(milliseconds: 320 + index * 40),
                      offsetY: 8,
                      child: _SeriesCard(series: series[index]),
                    ),
                  );
                },
                loading: () => const ArenaLoadingState(
                  label: 'Carregando horários fixos...',
                ),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onAdd(
    BuildContext context,
    WidgetRef ref, {
    required bool canAdd,
    required int? max,
  }) {
    if (!canAdd && max != null) {
      showArenaPlanUpsellSheet(
        context,
        capability: ArenaCapability.promocoes,
        icon: Icons.event_repeat_rounded,
        title: 'Limite de horários fixos atingido',
        description: 'O plano atual permite até $max horários fixos ativos. '
            'Assine o Pro para criar quantos precisar.',
      );
      return;
    }
    context.pushNamed(AppRouteNames.arenaRecurringNew);
  }
}

class _RecurringListHeader extends StatelessWidget {
  const _RecurringListHeader({
    required this.arenaName,
    required this.onBack,
    required this.onAdd,
  });

  final String? arenaName;
  final VoidCallback onBack;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = arenaName?.trim().isNotEmpty == true
        ? arenaName!.trim().toUpperCase()
        : 'ARENA';

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 20, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _HeaderIconButton(
            icon: Icons.arrow_back_rounded,
            onTap: onBack,
          ),
          const SizedBox(width: 4),
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
                  'Horários fixos',
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
              onTap: onAdd,
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
                        'Novo',
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
        ],
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _SeriesCard extends StatelessWidget {
  const _SeriesCard({required this.series});

  final ArenaRecurringBooking series;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = series.customerName ?? 'Mensalista';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.pushNamed(
          AppRouteNames.arenaRecurringDetail,
          pathParameters: {'seriesId': series.id},
        ),
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        child: Ink(
          decoration: ArenaDashboardTokens.cardDecoration(context),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.event_repeat_rounded,
                    color: AppColors.brand,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${series.weekdayLabel} · '
                        '${series.startTime} – ${series.endTime}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      if (series.isPaused) ...[
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            // Mesmo tom de âmbar do status "pendente" no
                            // portal web (--nx-pending), pra consistência
                            // visual entre as duas plataformas.
                            color: const Color(0xFFF4C543).withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'PAUSADO',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: const Color(0xFFF4C543),
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        '$name · ${series.courtName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      formatBRL(series.amountReais),
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'por semana',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 4),
                Icon(
                  Icons.chevron_right_rounded,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
