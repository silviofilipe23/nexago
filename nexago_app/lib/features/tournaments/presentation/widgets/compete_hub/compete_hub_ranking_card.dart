import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../ranking/domain/ranking_display_helpers.dart';
import '../../../domain/compete_hub_models.dart';

class CompeteHubRankingCard extends StatelessWidget {
  const CompeteHubRankingCard({super.key, required this.ranking});

  final CompeteHubUserRanking ranking;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF2A1810),
            Color(0xFF120A08),
            Color(0xFF050505),
          ],
        ),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.18),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            Positioned(
              right: -24,
              top: -24,
              child: Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.brand.withValues(alpha: 0.08),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'SEU RANKING · ${ranking.seasonLabel}',
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.onSurfaceMuted,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        ranking.rankLabel,
                        style: AppTypography.soraRegular(
                          fontSize: 44,
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                          height: 1,
                          letterSpacing: -1.5,
                        ),
                      ),
                      const Spacer(),
                      _MetricColumn(
                        value: formatRankingPoints(ranking.points),
                        label: 'PONTOS',
                        valueColor: AppColors.brand,
                      ),
                      const SizedBox(width: 18),
                      _MetricColumn(
                        value: '${ranking.tournamentsCount}',
                        label: 'TORNEIOS',
                        valueColor: AppColors.win,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    ranking.subtitle,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                  if (ranking.canPromote) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Text(
                          'SUBIR 1 POSIÇÃO',
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                            color: AppColors.onSurfaceMuted,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          '${ranking.promotionPointsRemaining} pts',
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: AppColors.brand,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: ranking.promotionProgress.clamp(0, 1),
                        minHeight: 6,
                        backgroundColor: AppColors.surfaceRaised,
                        color: AppColors.brand,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricColumn extends StatelessWidget {
  const _MetricColumn({
    required this.value,
    required this.label,
    required this.valueColor,
  });

  final String value;
  final String label;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          value,
          style: AppTypography.soraRegular(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: valueColor,
            height: 1.1,
          ),
        ),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 9,
            fontWeight: FontWeight.w600,
            color: AppColors.onSurfaceMuted,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}
