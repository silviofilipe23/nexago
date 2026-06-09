import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';

/// Badge pill «AO VIVO» para partidas em andamento.
class TournamentMatchLiveBadge extends StatelessWidget {
  const TournamentMatchLiveBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.live,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.white,
              shape: BoxShape.circle,
            ),
          ),
          SizedBox(width: 6),
          Text(
            'AO VIVO',
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: AppColors.white,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Badge pill «FINALIZADO» para partidas encerradas.
class TournamentMatchFinalizedBadge extends StatelessWidget {
  const TournamentMatchFinalizedBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.win,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        'FINALIZADO',
        style: AppTypography.mono(
          fontSize: 9,
          fontWeight: FontWeight.w800,
          color: AppColors.white,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
