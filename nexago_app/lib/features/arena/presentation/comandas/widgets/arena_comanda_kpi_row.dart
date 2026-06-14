import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/comandas/arena_comanda_logic.dart';
import '../../../domain/comandas/arena_comanda_providers.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaComandaKpiRow extends ConsumerWidget {
  const ArenaComandaKpiRow({
    super.key,
    required this.arenaId,
  });

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kpis = ref.watch(arenaComandasKpisProvider(arenaId));

    return Row(
      children: [
        Expanded(
          child: _KpiCard(
            label: 'ABERTAS',
            value: '${kpis.openCount}',
            valueColor: AppColors.brand,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _KpiCard(
            label: 'HOJE',
            value: formatComandaReais(kpis.todayTotalCents),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _KpiCard(
            label: 'TICKET',
            value: formatComandaReais(kpis.averageTicketCents),
          ),
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: valueColor ?? context.themeColors.onSurface,
                  fontSize: 18,
                ),
          ),
        ],
      ),
    );
  }
}
