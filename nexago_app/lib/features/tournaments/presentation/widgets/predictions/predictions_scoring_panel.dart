import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

/// "Como pontuar": as duas únicas regras que o backend aplica de fato
/// (`MATCH_PICK_POINTS` e `CHAMPION_PICK_POINTS`,
/// `functions/src/tournament-predictions.ts`). Não há placar exato nem bônus de
/// sequência — se algum dia houver, é aqui que a lista cresce.
class PredictionsScoringPanel extends StatelessWidget {
  const PredictionsScoringPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.surfaceRaised),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Como pontuar',
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          const _Rule(
            title: 'Vencedor certo',
            detail: '+1 ponto por jogo',
          ),
          const SizedBox(height: 10),
          const _Rule(
            title: 'Campeão do torneio',
            detail: '+3 pontos extras — o palpite da final vale 4',
          ),
        ],
      ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule({required this.title, required this.detail});

  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          margin: const EdgeInsets.only(top: 7),
          width: 6,
          height: 6,
          decoration: const BoxDecoration(
            color: AppColors.brand,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                detail,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
