import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_business_providers.dart';
import '../../domain/arena_month_goal.dart';

/// Destaque da aba Negócio: faturamento do mês rumo à meta, com projeção.
/// Só aparece para quem lê o financeiro (quem chama faz o gate).
class ArenaMonthGoalCard extends ConsumerWidget {
  const ArenaMonthGoalCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = ref.watch(arenaMonthGoalProgressProvider).valueOrNull;
    final isOwner =
        ref.watch(arenaAccessProvider).valueOrNull?.isOwner ?? false;
    if (progress == null) return const SizedBox.shrink();

    final month = DateFormat.MMMM('pt_BR').format(progress.month);
    return progress.hasGoal
        ? _WithGoal(progress: progress, month: month, canEdit: isOwner)
        : _NoGoal(progress: progress, month: month, canEdit: isOwner);
  }
}

void _openGoalSettings(BuildContext context) =>
    context.pushNamed(AppRouteNames.arenaMonthGoal);

BoxDecoration _heroDecoration() => BoxDecoration(
  borderRadius: BorderRadius.circular(20),
  gradient: RadialGradient(
    center: Alignment.topRight,
    radius: 1.4,
    colors: [
      AppColors.brand.withValues(alpha: 0.24),
      AppColors.brand.withValues(alpha: 0.03),
    ],
  ),
  border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
);

class _WithGoal extends StatelessWidget {
  const _WithGoal({
    required this.progress,
    required this.month,
    required this.canEdit,
  });

  final ArenaMonthGoalProgress progress;
  final String month;
  final bool canEdit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final goal = progress.goalReais ?? 0;
    final pct = (progress.realizedFraction * 100).round();
    final needed = progress.neededPerDay;
    final projectionTone = progress.onTrack ? colors.win : colors.pending;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 16),
      decoration: _heroDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'META DE ${month.toUpperCase()}',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: colors.brandText,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
              if (canEdit)
                IconButton(
                  tooltip: 'Editar meta',
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _openGoalSettings(context),
                  icon: Icon(
                    Icons.edit_outlined,
                    size: 18,
                    color: colors.onSurfaceMuted,
                  ),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          formatBRL(progress.realizedReais),
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -1,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      Text(
                        'de ${formatBRLWhole(goal)} · dia '
                        '${progress.dayOfMonth} de ${progress.daysInMonth}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  '$pct%',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.brandText,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: _GoalBar(progress: progress),
          ),
          const SizedBox(height: 12),
          // O card recua só 8 à direita por causa do botão de editar; o texto
          // corrido volta aos 16 de respiro.
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                    children: [
                      const TextSpan(text: 'No ritmo atual, o mês fecha em '),
                      TextSpan(
                        text: formatBRLWhole(progress.projectionReais),
                        style: TextStyle(
                          color: projectionTone,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      TextSpan(
                        text: progress.onTrack
                            ? ' e bate a meta.'
                            : needed == null || needed <= 0
                            ? '.'
                            : '. Faltam ${formatBRLWhole(needed)} por dia.',
                      ),
                    ],
                  ),
                ),
                if (progress.bookedAheadReais > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${formatBRLWhole(progress.bookedAheadReais)} já reservados '
                    'até o fim do mês.',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Barra: feito (cheio) + já reservado (claro) + marca da projeção.
class _GoalBar extends StatelessWidget {
  const _GoalBar({required this.progress});

  final ArenaMonthGoalProgress progress;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final goal = progress.goalReais ?? 1;
    double frac(double v) => (v / goal).clamp(0.0, 1.0);
    final done = frac(progress.realizedReais);
    final booked = frac(progress.realizedReais + progress.bookedAheadReais);
    final projected = frac(progress.projectionReais);

    return Semantics(
      label: 'Meta ${(progress.realizedFraction * 100).round()}% feita',
      child: SizedBox(
        height: 12,
        child: LayoutBuilder(
          builder: (context, c) {
            final w = c.maxWidth;
            return Stack(
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: colors.onSurfaceMuted.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                Container(
                  width: w * booked,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                Container(
                  width: w * done,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                Positioned(
                  left: (w * projected - 1.5).clamp(0.0, w - 3),
                  top: 0,
                  bottom: 0,
                  child: Container(
                    width: 3,
                    decoration: BoxDecoration(
                      color: colors.onSurface,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _NoGoal extends StatelessWidget {
  const _NoGoal({
    required this.progress,
    required this.month,
    required this.canEdit,
  });

  final ArenaMonthGoalProgress progress;
  final String month;
  final bool canEdit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: _heroDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'FATURAMENTO DE ${month.toUpperCase()}',
            style: theme.textTheme.labelSmall?.copyWith(
              color: colors.brandText,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            formatBRL(progress.realizedReais),
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -1,
              color: colors.onSurface,
            ),
          ),
          Text(
            'No ritmo atual, o mês fecha em '
            '${formatBRLWhole(progress.projectionReais)}.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 12),
          if (canEdit)
            FilledButton.icon(
              onPressed: () => _openGoalSettings(context),
              icon: const Icon(Icons.flag_outlined, size: 18),
              label: const Text('Definir meta do mês'),
            )
          else
            Text(
              'O dono da arena ainda não definiu a meta do mês.',
              style: theme.textTheme.labelSmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
        ],
      ),
    );
  }
}
