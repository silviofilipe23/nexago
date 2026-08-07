import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/predictions/tournament_predictions_logic.dart';

/// "Sua campanha": o retrato do próprio atleta no ranking de palpites.
///
/// Os números são os que existem de verdade — pontos creditados pelo servidor,
/// acertos sobre o que já foi DECIDIDO (dizer "2 de 9" com 7 jogos por vir
/// seria mentira) e quantos palpites seguem em jogo.
class PredictionsCampaignCard extends StatelessWidget {
  const PredictionsCampaignCard({super.key, required this.stats});

  final PredictionStats stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final move = predictionDeltaLabel(stats.delta);
    final up = (stats.delta ?? 0) > 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SUA CAMPANHA',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
            ).copyWith(letterSpacing: 1.4),
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (stats.rank != null) ...[
                Text(
                  '#${stats.rank}',
                  style: AppTypography.soraRegular(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: AppColors.brand,
                  ),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${stats.points} ${stats.points == 1 ? 'ponto' : 'pontos'}',
                      style: AppTypography.soraRegular(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    if (move != null)
                      Text(
                        move,
                        style: AppTypography.soraRegular(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: up
                              ? const Color(0xFF2BD17E)
                              : const Color(0xFFFF6B6B),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _Stat(value: '${stats.hits}/${stats.decided}', label: 'acertos'),
              _Stat(value: '${stats.pending}', label: 'em jogo'),
              if (stats.rank != null)
                _Stat(value: '${stats.rank}º', label: 'de ${stats.totalPlayers}'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: colors.onSurfaceMuted,
            ).copyWith(letterSpacing: 0.8),
          ),
        ],
      ),
    );
  }
}
