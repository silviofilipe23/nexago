import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_discovery_models.dart';

class TournamentDetailCategoriesCard extends StatelessWidget {
  const TournamentDetailCategoriesCard({
    super.key,
    required this.offers,
    this.enrollmentByCategoryId = const {},
  });

  final List<TournamentCategoryOffer> offers;
  final Map<String, int> enrollmentByCategoryId;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'CATEGORIAS',
            style: AppTypography.mono(
              fontSize: 11,
              color: AppColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.8,
            ),
          ),
          if (offers.isEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Categorias serão publicadas em breve pelo organizador.',
              style: AppTypography.soraRegular(
                fontSize: 14,
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ] else ...[
            const SizedBox(height: 12),
            for (var i = 0; i < offers.length; i++) ...[
              if (i > 0)
                Divider(
                  height: 20,
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              _CategoryRow(
                offer: offers[i],
                inscriptionCount: enrollmentByCategoryId[offers[i].id],
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.offer,
    this.inscriptionCount,
  });

  final TournamentCategoryOffer offer;
  final int? inscriptionCount;

  @override
  Widget build(BuildContext context) {
    final status = tournamentCategoryRowStatus(
      offer,
      inscriptionCount: inscriptionCount,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                offer.name,
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                tournamentCategorySubtitle(offer),
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        if (status.isClosed)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.live.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppColors.live.withValues(alpha: 0.45),
              ),
            ),
            child: Text(
              status.label,
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: status.color,
                letterSpacing: 0.4,
              ),
            ),
          )
        else
          Text(
            status.label,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: status.color,
            ),
          ),
      ],
    );
  }
}
