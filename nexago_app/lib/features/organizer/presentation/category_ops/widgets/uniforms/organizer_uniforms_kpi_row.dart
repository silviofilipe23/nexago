import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../domain/tournament_uniforms/tournament_uniforms_models.dart';

class OrganizerUniformsKpiRow extends StatelessWidget {
  const OrganizerUniformsKpiRow({
    super.key,
    required this.summary,
    required this.pendingFilterActive,
    required this.onPendingTap,
  });

  final OrganizerUniformsSummary summary;
  final bool pendingFilterActive;
  final VoidCallback onPendingTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: _KpiCard(
              label: 'TOTAL',
              value: '${summary.totalAthletes}',
              subtitle: 'atletas',
              valueColor: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _KpiCard(
              label: 'CONFIRM.',
              value: '${summary.confirmedCount}',
              subtitle: '${summary.confirmedPercent}% do total',
              valueColor: AppColors.win,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: GestureDetector(
              onTap: onPendingTap,
              child: _KpiCard(
                label: 'PENDENTES',
                value: '${summary.pendingCount}',
                subtitle: pendingFilterActive ? 'FILTR. ATIVO' : 'toque p/ ver',
                valueColor: AppColors.pending,
                subtitleColor: pendingFilterActive
                    ? AppColors.pending
                    : context.themeColors.onSurfaceMuted,
                highlighted: pendingFilterActive,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    required this.subtitle,
    required this.valueColor,
    this.subtitleColor,
    this.highlighted = false,
  });

  final String label;
  final String value;
  final String subtitle;
  final Color valueColor;
  final Color? subtitleColor;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlighted
              ? AppColors.pending.withValues(alpha: 0.45)
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: valueColor,
              height: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: AppTypography.soraRegular(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: subtitleColor ?? context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}
