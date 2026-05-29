import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/tournament_match_card_view_model.dart';
import '../../domain/tournament_match_display.dart';

class TournamentMatchCard extends StatelessWidget {
  const TournamentMatchCard({
    super.key,
    required this.viewModel,
  });

  final TournamentMatchCardViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final match = viewModel.match;
    final statusLabel = matchStatusPillLabelPt(match.status);
    final isLive = match.isInProgress;

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isLive
              ? AppColors.brand.withValues(alpha: 0.45)
              : AppColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  viewModel.teamsLabel,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              _StatusBadge(label: statusLabel, isLive: isLive),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            matchCardScoreLabel(match),
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.isLive});

  final String label;
  final bool isLive;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: isLive
            ? AppColors.brand.withValues(alpha: 0.15)
            : AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          color: isLive ? AppColors.brand : AppColors.onSurfaceMuted,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
