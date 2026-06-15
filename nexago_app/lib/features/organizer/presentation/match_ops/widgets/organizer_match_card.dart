import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/match_ops/match_ops_models.dart';
import '../../../../tournaments/domain/tournament_match.dart';
import '../../../domain/match_ops/match_scoring_logic.dart';

class OrganizerMatchCard extends StatelessWidget {
  const OrganizerMatchCard({
    super.key,
    required this.row,
    this.onTap,
    this.trailing,
  });

  final OrganizerMatchRow row;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final match = row.match;
    final colors = context.themeColors;

    return Card(
      color: colors.surfaceCard,
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  OrganizerMatchStatusBadge(row: row),
                  const Spacer(),
                  if (match.effectiveCourtLabel.isNotEmpty)
                    OrganizerCourtStatusChip(label: match.effectiveCourtLabel),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                match.teamsLabel,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: colors.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                match.categoryId,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceMuted,
                    ),
              ),
              if (row.isLive || match.sets.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  MatchScoringLogic.setsScoreLabel(match),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
              if (trailing != null) ...[
                const SizedBox(height: 10),
                trailing!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class OrganizerMatchStatusBadge extends StatelessWidget {
  const OrganizerMatchStatusBadge({super.key, required this.row});

  final OrganizerMatchRow row;

  @override
  Widget build(BuildContext context) {
    final label = row.isLive
        ? 'AO VIVO'
        : row.isFinished
            ? 'ENCERRADA'
            : row.match.isOnCourt
                ? 'EM QUADRA'
                : 'A SEGUIR';
    final color = row.isLive
        ? AppColors.live
        : row.isFinished
            ? context.themeColors.onSurfaceMuted
            : AppColors.brand;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class OrganizerCourtStatusChip extends StatelessWidget {
  const OrganizerCourtStatusChip({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: context.themeColors.outline),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall,
      ),
    );
  }
}

class OrganizerCourtKpiRow extends StatelessWidget {
  const OrganizerCourtKpiRow({super.key, required this.kpis});

  final CourtPanelKpis kpis;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _KpiTile(label: 'Quadras', value: '${kpis.totalCourts}'),
        _KpiTile(label: 'Ao vivo', value: '${kpis.activeCourts}'),
        _KpiTile(label: 'Livres', value: '${kpis.freeCourts}'),
        _KpiTile(label: 'Fila', value: '${kpis.waitingQueue}'),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: AppColors.brand,
                  fontWeight: FontWeight.bold,
                ),
          ),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
          ),
        ],
      ),
    );
  }
}
