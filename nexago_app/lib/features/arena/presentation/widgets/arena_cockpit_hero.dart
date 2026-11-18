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
import '../../domain/arena_cockpit.dart';
import '../../domain/arena_dashboard_period.dart';
import '../../domain/arena_month_goal.dart';
import '../../domain/arena_staff_role.dart';
import '../arena_dashboard_formatters.dart';
import 'arena_cockpit_sparkline.dart';

/// Destaque do cockpit (aba Negócio): o número principal do período, a
/// variação justa, a curva e — para quem vê o financeiro — a meta do mês.
///
/// Quem não lê o financeiro vê o mesmo destaque com reservas no lugar do
/// faturamento, sem meta.
class ArenaCockpitHero extends ConsumerWidget {
  const ArenaCockpitHero({super.key, required this.cockpit});

  final ArenaCockpit cockpit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final seesMoney = ref.watch(arenaCanReadProvider(ArenaArea.financeiro));
    final isOwner =
        ref.watch(arenaAccessProvider).valueOrNull?.isOwner ?? false;
    final goal = seesMoney
        ? ref.watch(arenaMonthGoalProgressProvider).valueOrNull
        : null;
    final isMonth = cockpit.period == ArenaDashboardPeriod.month;

    final title = seesMoney ? 'Faturamento' : 'Reservas';
    final value = seesMoney
        ? formatBRL(cockpit.revenue)
        : '${cockpit.bookings}';
    final delta = seesMoney
        ? _percentDelta(cockpit.revenueChangePercent)
        : _countDelta(cockpit.bookingsChange);
    final series = seesMoney
        ? cockpit.revenueSeries
        : [for (final v in cockpit.bookingsSeries) v.toDouble()];
    final monthGoal = isMonth && goal != null && goal.hasGoal ? goal : null;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: RadialGradient(
          center: Alignment.topRight,
          radius: 1.3,
          colors: [
            AppColors.brand.withValues(alpha: 0.26),
            AppColors.brand.withValues(alpha: 0.03),
          ],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${title.toUpperCase()} · ${_periodLabel(cockpit)}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: colors.brandText,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 6),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        value,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -1.2,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    _DeltaLine(delta: delta, label: cockpit.comparisonLabel),
                  ],
                ),
              ),
              if (seesMoney && goal != null) ...[
                const SizedBox(width: 12),
                _GoalBadge(goal: goal, canEdit: isOwner),
              ],
            ],
          ),
          const SizedBox(height: 12),
          ArenaCockpitSparkline(
            values: series,
            color: AppColors.brand,
            guideColor: colors.onSurfaceMuted,
            slots: monthGoal?.daysInMonth,
            projection: monthGoal?.projectionReais,
            goal: monthGoal?.goalReais,
          ),
          const SizedBox(height: 4),
          _AxisLabels(cockpit: cockpit, daysInMonth: monthGoal?.daysInMonth),
          if (seesMoney && goal != null) ...[
            const SizedBox(height: 10),
            _GoalFooter(goal: goal, isMonth: isMonth),
          ],
        ],
      ),
    );
  }

  static String _periodLabel(ArenaCockpit c) {
    switch (c.period) {
      case ArenaDashboardPeriod.today:
        return 'HOJE';
      case ArenaDashboardPeriod.week:
        return 'ÚLTIMOS 7 DIAS';
      case ArenaDashboardPeriod.month:
        final month = c.seriesDays.isEmpty
            ? ''
            : DateFormat.MMMM('pt_BR').format(c.seriesDays.first);
        return month.toUpperCase();
    }
  }
}

/// Variação já formatada (`label`) e sinal (+1, 0, -1).
typedef ArenaCockpitDelta = ({String label, int sign});

ArenaCockpitDelta? _percentDelta(double? p) {
  if (p == null) return null;
  if (p.abs() < 1) return (label: '= igual', sign: 0);
  return (
    label: '${p > 0 ? '▲' : '▼'} ${p.abs().toStringAsFixed(0)}%',
    sign: p.sign.toInt(),
  );
}

ArenaCockpitDelta? _countDelta(int? n) {
  if (n == null) return null;
  if (n == 0) return (label: '= igual', sign: 0);
  return (label: '${n > 0 ? '▲' : '▼'} ${n.abs()}', sign: n.sign);
}

class _DeltaLine extends StatelessWidget {
  const _DeltaLine({required this.delta, required this.label});

  final ArenaCockpitDelta? delta;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted);
    final d = delta;
    if (d == null) {
      return Text('Sem base para comparar', style: style);
    }
    final tone = d.sign > 0
        ? colors.win
        : d.sign < 0
        ? colors.live
        : colors.onSurfaceMuted;
    return Text.rich(
      TextSpan(
        style: style,
        children: [
          TextSpan(
            text: d.label,
            style: TextStyle(color: tone, fontWeight: FontWeight.w800),
          ),
          TextSpan(text: ' $label'),
        ],
      ),
    );
  }
}

class _GoalBadge extends StatelessWidget {
  const _GoalBadge({required this.goal, required this.canEdit});

  final ArenaMonthGoalProgress goal;
  final bool canEdit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    void edit() => context.pushNamed(AppRouteNames.arenaMonthGoal);

    if (!goal.hasGoal) {
      if (!canEdit) return const SizedBox.shrink();
      return OutlinedButton.icon(
        onPressed: edit,
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.brandText,
          side: BorderSide(color: AppColors.brand.withValues(alpha: 0.5)),
          visualDensity: VisualDensity.compact,
        ),
        icon: const Icon(Icons.flag_outlined, size: 16),
        label: const Text('Definir meta'),
      );
    }

    final pct = (goal.realizedFraction * 100).round();
    final ring = SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: goal.realizedFraction.clamp(0.0, 1.0),
              strokeWidth: 7,
              strokeCap: StrokeCap.round,
              color: AppColors.brand,
              backgroundColor: colors.onSurfaceMuted.withValues(alpha: 0.18),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$pct%',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                  height: 1,
                ),
              ),
              Text(
                'da meta',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: colors.onSurfaceMuted,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ],
      ),
    );
    return Semantics(
      label: 'Meta do mês: $pct% feita',
      button: canEdit,
      child: canEdit
          ? Tooltip(
              message: 'Editar meta',
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: edit,
                child: ring,
              ),
            )
          : ring,
    );
  }
}

class _AxisLabels extends StatelessWidget {
  const _AxisLabels({required this.cockpit, this.daysInMonth});

  final ArenaCockpit cockpit;
  final int? daysInMonth;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: context.themeColors.onSurfaceMuted,
      fontSize: 10,
    );
    final days = cockpit.seriesDays;
    if (days.isEmpty) return const SizedBox.shrink();
    final fmt = DateFormat('d/MM');
    final String right;
    if (daysInMonth != null) {
      right = fmt.format(
        DateTime(days.first.year, days.first.month, daysInMonth!),
      );
    } else {
      right = 'hoje';
    }
    return Row(
      children: [
        Text(fmt.format(days.first), style: style),
        const Spacer(),
        if (daysInMonth != null) Text('meta e projeção  ·  ', style: style),
        Text(right, style: style),
      ],
    );
  }
}

class _GoalFooter extends StatelessWidget {
  const _GoalFooter({required this.goal, required this.isMonth});

  final ArenaMonthGoalProgress goal;
  final bool isMonth;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = Theme.of(
      context,
    ).textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted, height: 1.35);
    final strong = TextStyle(
      color: goal.hasGoal
          ? (goal.onTrack ? colors.win : colors.pending)
          : colors.onSurface,
      fontWeight: FontWeight.w800,
    );
    final month = DateFormat.MMMM('pt_BR').format(goal.month);
    final projection = formatDashboardCompactCurrency(goal.projectionReais);

    final List<InlineSpan> spans;
    if (!goal.hasGoal) {
      spans = [
        TextSpan(text: 'No ritmo atual, $month fecha em '),
        TextSpan(text: projection, style: strong),
        const TextSpan(text: '.'),
      ];
    } else if (isMonth) {
      final needed = goal.neededPerDay;
      spans = [
        const TextSpan(text: 'No ritmo atual, fecha em '),
        TextSpan(text: projection, style: strong),
        TextSpan(
          text:
              ' · meta '
              '${formatDashboardCompactCurrency(goal.goalReais ?? 0)}',
        ),
        if (goal.onTrack)
          const TextSpan(text: '. Bate a meta.')
        else if (needed != null && needed > 0)
          TextSpan(text: '. Faltam ${formatBRLWhole(needed)} por dia.'),
      ];
    } else {
      spans = [
        TextSpan(
          text:
              'Meta de $month: '
              '${(goal.realizedFraction * 100).round()}% · fecha em ',
        ),
        TextSpan(text: projection, style: strong),
      ];
    }
    return Text.rich(TextSpan(style: style, children: spans));
  }
}
