import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../athlete/domain/sand_rank/sand_rank_catalog.dart';
import '../../../athlete/domain/sand_rank/sand_rank_reward_catalog.dart';
import '../../domain/partner.dart';
import 'partner_visuals.dart';

const double _rankDotSize = 8;

/// Teto do selo na linha (o título longo, sem selo, corta com reticências).
const double _benefitMaxWidth = 160;

/// Nome do elo em PT ("Competidor"); código desconhecido aparece cru.
String _rankName(String rankCode) =>
    sandRankTrack
        .where((step) => step.rankCode == rankCode)
        .firstOrNull
        ?.rankName ??
    rankCode;

/// "Desconto por elo": o benefício-base (Iniciante) e cada faixa, com o
/// selo, marcando a do atleta.
class BenefitLevelLadder extends StatelessWidget {
  const BenefitLevelLadder({super.key, required this.ladder});

  static const Key currentRowKey = Key('benefits-level-ladder-current');

  final PartnerLevelLadder ladder;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: AppBorders.subtle(colors),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const BenefitsEyebrow('Desconto por elo'),
          const SizedBox(height: AppSpacing.xs),
          for (final rung in ladder.rungs)
            _LadderRow(rung: rung, current: rung.minRank == ladder.currentRank),
        ],
      ),
    );
  }
}

class _LadderRow extends StatelessWidget {
  const _LadderRow({required this.rung, required this.current});

  final PartnerLevelTier rung;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rankColor = sandRankColor(rung.minRank);
    final name = _rankName(rung.minRank);
    final benefit = rung.benefitHighlight.isNotEmpty
        ? rung.benefitHighlight
        : rung.benefitTitle;
    return Semantics(
      label: current ? '$name, seu desconto: $benefit' : '$name: $benefit',
      excludeSemantics: true,
      child: Container(
        key: current ? BenefitLevelLadder.currentRowKey : null,
        margin: const EdgeInsets.only(bottom: AppSpacing.xs),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.sm,
        ),
        decoration: current
            ? BoxDecoration(
                color: rankColor.withValues(alpha: 0.10),
                borderRadius: AppRadii.mdAll,
                border: Border.all(color: rankColor.withValues(alpha: 0.45)),
              )
            : null,
        child: Row(
          children: [
            Container(
              width: _rankDotSize,
              height: _rankDotSize,
              decoration: BoxDecoration(
                color: rankColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Row(
                children: [
                  Flexible(
                    child: Text(
                      name,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 13,
                        fontWeight: current ? FontWeight.w700 : FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                  if (current) ...[
                    const SizedBox(width: AppSpacing.sm),
                    BenefitsEyebrow('Seu desconto', color: rankColor),
                  ],
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: _benefitMaxWidth),
              child: Text(
                benefit,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.end,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: current ? colors.win : colors.onSurfaceMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
