import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/theme/app_colors.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../domain/tournament_category_spots.dart';
import '../../domain/tournament_discovery_labels.dart';
import '../../domain/tournament_discovery_models.dart';

/// Bloco "VAGAS POR CATEGORIA" para cards e detalhe do torneio.
class TournamentCategorySpotsSection extends ConsumerWidget {
  const TournamentCategorySpotsSection({
    super.key,
    required this.tournamentId,
    required this.offers,
    required this.format,
    this.showHeader = true,
  });

  final String tournamentId;
  final List<TournamentCategoryOffer> offers;
  final TournamentFormat format;
  final bool showHeader;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enrollment = ref
            .watch(
              tournamentCategoryEnrollmentCountsProvider(tournamentId),
            )
            .valueOrNull ??
        const <String, int>{};
    if (offers.isEmpty) return const SizedBox.shrink();

    final formatLabel = tournamentFormatLabel(format);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showHeader) ...[
          Text(
            'VAGAS POR CATEGORIA',
            style: AppTypography.mono(
              fontSize: 11,
              color: AppColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 12),
        ],
        for (var i = 0; i < offers.length; i++) ...[
          if (i > 0)
            Divider(
              height: 20,
              thickness: 1,
              color: AppColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          _CategorySpotsRow(
            offer: offers[i],
            formatLabel: formatLabel,
            inscriptionCount: inscriptionCountForCategory(
              enrollment,
              offers[i].id,
            ),
          ),
        ],
      ],
    );
  }
}

class _CategorySpotsRow extends StatelessWidget {
  const _CategorySpotsRow({
    required this.offer,
    required this.formatLabel,
    required this.inscriptionCount,
  });

  final TournamentCategoryOffer offer;
  final String formatLabel;
  final int inscriptionCount;

  @override
  Widget build(BuildContext context) {
    final total = categoryMaxTeams(offer);
    final spotsLeft = categorySpotsLeft(
      offer,
      inscriptionCount: inscriptionCount,
    );
    final status = categorySpotsVisualStatus(
      spotsLeft: spotsLeft,
      spotsTotal: total,
    );
    final color = categorySpotsStatusColor(status);
    final enrolled = categoryEnrolledCount(
      offer,
      inscriptionCount: inscriptionCount,
    );
    final fill = total > 0 ? (enrolled / total).clamp(0.0, 1.0) : 0.0;
    final rightLabel = categorySpotsRightLabel(
      spotsLeft: spotsLeft,
      status: status,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 52,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                categoryOfferDisplayName(offer),
                style: AppTypography.soraRegular(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.onSurface,
                  height: 1.2,
                ),
              ),
              Text(
                formatLabel,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: fill,
                  minHeight: 5,
                  backgroundColor:
                      AppColors.onSurfaceMuted.withValues(alpha: 0.2),
                  color: color,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                total > 0 ? '$enrolled/$total inscritas' : '— inscritas',
                textAlign: TextAlign.center,
                style: AppTypography.mono(
                  fontSize: 11,
                  color: AppColors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 64,
          child: Align(
            alignment: Alignment.topRight,
            child: Text(
              rightLabel,
              textAlign: TextAlign.right,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
