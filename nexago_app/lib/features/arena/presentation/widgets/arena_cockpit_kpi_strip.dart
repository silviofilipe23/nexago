import 'package:flutter/material.dart';

import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_cockpit.dart';
import '../arena_dashboard_formatters.dart';
import 'arena_dashboard_tokens.dart';

/// Faixa de indicadores secundários do cockpit, cada um com a variação.
///
/// Quem vê o financeiro: Ocupação, Reservas, Ticket médio (o faturamento já
/// é o destaque). Os demais: Ocupação e Horário de pico (as reservas já são
/// o destaque deles).
class ArenaCockpitKpiStrip extends StatelessWidget {
  const ArenaCockpitKpiStrip({
    super.key,
    required this.cockpit,
    required this.seesMoney,
  });

  final ArenaCockpit cockpit;
  final bool seesMoney;

  @override
  Widget build(BuildContext context) {
    final c = cockpit;
    final occupancy = _Kpi(
      label: 'Ocupação',
      value: c.occupancy == null
          ? '—'
          : formatDashboardOccupancyPercent(c.occupancy!),
      delta: _points(c.occupancyChangePoints),
    );
    final tiles = seesMoney
        ? [
            occupancy,
            _Kpi(
              label: 'Reservas',
              value: '${c.bookings}',
              delta: _count(c.bookingsChange),
            ),
            _Kpi(
              label: 'Ticket médio',
              value: c.ticket == null ? '—' : formatBRLWhole(c.ticket!),
              delta: _percent(c.ticketChangePercent),
            ),
          ]
        : [
            occupancy,
            _Kpi(
              label: 'Horário de pico',
              value: formatDashboardPeakHour(c.peakHour),
            ),
          ];

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < tiles.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: _KpiTile(kpi: tiles[i])),
          ],
        ],
      ),
    );
  }

  static ({String label, int sign})? _points(double? p) {
    if (p == null) return null;
    if (p.abs() < 1) return (label: '= igual', sign: 0);
    return (
      label: '${p > 0 ? '▲' : '▼'} ${p.abs().toStringAsFixed(0)} p.p.',
      sign: p.sign.toInt(),
    );
  }

  static ({String label, int sign})? _count(int? n) {
    if (n == null) return null;
    if (n == 0) return (label: '= igual', sign: 0);
    return (label: '${n > 0 ? '▲' : '▼'} ${n.abs()}', sign: n.sign);
  }

  static ({String label, int sign})? _percent(double? p) {
    if (p == null) return null;
    if (p.abs() < 1) return (label: '= igual', sign: 0);
    return (
      label: '${p > 0 ? '▲' : '▼'} ${p.abs().toStringAsFixed(0)}%',
      sign: p.sign.toInt(),
    );
  }
}

class _Kpi {
  const _Kpi({required this.label, required this.value, this.delta});

  final String label;
  final String value;
  final ({String label, int sign})? delta;
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.kpi});

  final _Kpi kpi;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final d = kpi.delta;
    final tone = d == null || d.sign == 0
        ? colors.onSurfaceMuted
        : d.sign > 0
        ? colors.win
        : colors.live;
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              kpi.label.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall?.copyWith(
                color: colors.onSurfaceMuted,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
                fontSize: 10,
              ),
            ),
            const SizedBox(height: 6),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                kpi.value,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: colors.onSurface,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              d?.label ?? ' ',
              style: theme.textTheme.labelSmall?.copyWith(
                color: tone,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
