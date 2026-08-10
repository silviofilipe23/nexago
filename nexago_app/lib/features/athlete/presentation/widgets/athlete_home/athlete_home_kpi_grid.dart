import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../domain/athlete_home_dashboard_logic.dart';

/// Linha de KPIs 2×2 da Home (paridade com o painel web: Jogos no mês ·
/// Vitórias · Sequência · Ranking).
class AthleteHomeKpiGrid extends StatelessWidget {
  const AthleteHomeKpiGrid({super.key, required this.kpis});

  final List<AthleteHomeKpi> kpis;

  @override
  Widget build(BuildContext context) {
    if (kpis.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        for (var row = 0; row * 2 < kpis.length; row++) ...[
          if (row > 0) const SizedBox(height: AppSpacing.md),
          // IntrinsicHeight dá altura finita ao stretch (num sliver a altura
          // da Row seria infinita) e iguala os dois cards da linha.
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _KpiCard(kpi: kpis[row * 2])),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: row * 2 + 1 < kpis.length
                      ? _KpiCard(kpi: kpis[row * 2 + 1])
                      : const SizedBox.shrink(),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.kpi});

  final AthleteHomeKpi kpi;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final toneColor =
        kpi.tone == AthleteHomeKpiTone.green ? AppColors.win : AppColors.brand;

    return NexaCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  kpi.label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.eyebrow
                      .copyWith(color: colors.onSurfaceMuted),
                ),
              ),
              if (kpi.flame)
                Icon(
                  Icons.local_fire_department_rounded,
                  size: 14,
                  color: AppColors.brand,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            kpi.value,
            style: AppTypography.mono(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
              height: 1,
            ),
          ),
          const SizedBox(height: AppSpacing.sm + 2),
          // Delta e nota empilhados: lado a lado (como no desktop do painel)
          // a nota trunca na largura de celular.
          Row(
            children: [
              if (kpi.arrow) ...[
                Icon(
                  kpi.tone == AthleteHomeKpiTone.green
                      ? Icons.arrow_upward_rounded
                      : Icons.arrow_downward_rounded,
                  size: 11,
                  color: toneColor,
                ),
                const SizedBox(width: 2),
              ],
              Expanded(
                child: Text(
                  kpi.delta,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.monoMeta.copyWith(color: toneColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            kpi.note,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS
                .copyWith(color: colors.onSurfaceMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
