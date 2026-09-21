import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../domain/athlete_home_dashboard_logic.dart';

/// Linha única de KPIs da Home (Jogos no mês · Vitórias · Sequência · Ranking).
class AthleteHomeKpiGrid extends StatelessWidget {
  const AthleteHomeKpiGrid({super.key, required this.kpis});

  final List<AthleteHomeKpi> kpis;

  @override
  Widget build(BuildContext context) {
    if (kpis.isEmpty) return const SizedBox.shrink();
    // IntrinsicHeight iguala a altura dos cards; Expanded divide a largura.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < kpis.length; i++) ...[
            if (i > 0) const SizedBox(width: AppSpacing.sm),
            Expanded(child: _KpiCard(kpi: kpis[i])),
          ],
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.kpi});

  final AthleteHomeKpi kpi;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final toneColor = kpi.tone == AthleteHomeKpiTone.green
        ? AppColors.win
        : AppColors.brand;

    return NexaCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  kpi.label.toUpperCase(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.eyebrow.copyWith(
                    color: colors.onSurfaceMuted,
                    fontSize: 8,
                    height: 1.15,
                  ),
                ),
              ),
              if (kpi.flame)
                Icon(
                  Icons.local_fire_department_rounded,
                  size: 12,
                  color: AppColors.brand,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            kpi.value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.mono(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
              height: 1,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              if (kpi.arrow) ...[
                Icon(
                  kpi.tone == AthleteHomeKpiTone.green
                      ? Icons.arrow_upward_rounded
                      : Icons.arrow_downward_rounded,
                  size: 10,
                  color: toneColor,
                ),
                const SizedBox(width: 1),
              ],
              Expanded(
                child: Text(
                  kpi.delta,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.monoMeta.copyWith(
                    color: toneColor,
                    fontSize: 10,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            kpi.note,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(
              color: colors.onSurfaceMuted,
              fontSize: 8,
            ),
          ),
        ],
      ),
    );
  }
}
