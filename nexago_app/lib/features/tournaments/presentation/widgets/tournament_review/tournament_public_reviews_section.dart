import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_providers.dart';

import '../../../domain/tournament_review_public_logic.dart';

/// "Como os atletas avaliaram" no detalhe do torneio (spec §5): média de cada aspecto com nota.
/// Ao vivo enquanto a janela está aberta; some abaixo de 3 avaliações.
class TournamentPublicReviewsSection extends ConsumerWidget {
  const TournamentPublicReviewsSection({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(tournamentReviewSummaryProvider(tournamentId)).valueOrNull;
    final rows = tournamentPublicAspectRows(summary);
    if (rows.isEmpty) return const SizedBox.shrink();
    final muted = context.themeColors.onSurfaceMuted;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'COMO OS ATLETAS AVALIARAM',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: muted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            decoration: BoxDecoration(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: muted.withValues(alpha: 0.12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final row in rows) _AspectBar(row: row)],
            ),
          ),
        ],
      ),
    );
  }
}

class _AspectBar extends StatelessWidget {
  const _AspectBar({required this.row});

  final TournamentPublicAspectRow row;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(row.label, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              Text(
                row.valueText,
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: row.fraction,
              minHeight: 6,
              color: AppColors.brand,
              backgroundColor: context.themeColors.surfaceCard,
            ),
          ),
        ],
      ),
    );
  }
}
