import 'package:flutter/material.dart';

import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_now.dart';
import '../arena_dashboard_formatters.dart';
import 'arena_dashboard_tokens.dart';

/// "Hoje" comparado com o mesmo dia da semana passada.
class ArenaNowTodayCard extends StatelessWidget {
  const ArenaNowTodayCard({
    super.key,
    required this.today,
    required this.seesMoney,
    this.onOpenBusiness,
  });

  final ArenaTodaySoFar today;
  final bool seesMoney;

  /// Leva à aba Negócio (null esconde o atalho).
  final VoidCallback? onOpenBusiness;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final revenueChange = today.revenueChangePercent;
    final occupancy = today.occupancyPercent;

    final cells = <Widget>[
      if (seesMoney)
        _Stat(
          label: 'Faturamento',
          value: formatBRL(today.revenueReais),
          delta: revenueChange == null ? null : _Delta.percent(revenueChange),
        ),
      _Stat(
        label: 'Reservas',
        value: '${today.bookingsCount}',
        delta: today.lastWeekBookingsCount == 0 && today.bookingsCount == 0
            ? null
            : _Delta.count(today.bookingsChange),
      ),
      _Stat(
        label: 'Ocupação',
        value: occupancy == null
            ? '—'
            : formatDashboardOccupancyPercent(occupancy),
      ),
    ];

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Hoje',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                if (onOpenBusiness != null)
                  TextButton(
                    onPressed: onOpenBusiness,
                    style: TextButton.styleFrom(
                      foregroundColor: colors.brandText,
                    ),
                    child: const Text('Ver números ›'),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < cells.length; i++) ...[
                    if (i > 0)
                      VerticalDivider(
                        width: 20,
                        color: colors.onSurfaceMuted.withValues(alpha: 0.16),
                      ),
                    Expanded(child: cells[i]),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Comparado com o mesmo dia da semana passada.',
              style: theme.textTheme.labelSmall?.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Delta {
  const _Delta(this.label, this.sign);

  factory _Delta.percent(double p) {
    if (p.abs() < 1) return const _Delta('= igual', 0);
    return _Delta(
      '${p > 0 ? '▲' : '▼'} ${p.abs().toStringAsFixed(0)}%',
      p.sign.toInt(),
    );
  }

  factory _Delta.count(int n) {
    if (n == 0) return const _Delta('= igual', 0);
    return _Delta('${n > 0 ? '▲' : '▼'} ${n.abs()}', n.sign);
  }

  final String label;
  final int sign;
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.delta});

  final String label;
  final String value;
  final _Delta? delta;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final d = delta;
    final deltaColor = d == null || d.sign == 0
        ? colors.onSurfaceMuted
        : d.sign > 0
        ? colors.win
        : colors.live;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
            color: colors.onSurfaceMuted,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
              color: colors.onSurface,
            ),
          ),
        ),
        if (d != null) ...[
          const SizedBox(height: 2),
          Text(
            d.label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: deltaColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    );
  }
}
