import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/sand_rank/sand_rank_catalog.dart';
import '../../../domain/sand_rank/sand_rank_models.dart';
import '../../../domain/sand_rank/sand_rank_reward_catalog.dart';
import 'sand_rank_emblem.dart';

/// Chip compacto do elo de um atleta (perfil público, ranking, cards).
/// Sempre prefixa "ELO" para não confundir com o nível técnico.
class SandRankBadge extends StatelessWidget {
  const SandRankBadge({
    super.key,
    required this.rank,
    this.equippedTitleId,
    this.compact = false,
  });

  final PublicSandRank? rank;
  final String? equippedTitleId;

  /// Compacto: só emblema + divisão (para linhas de lista).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final current = rank;
    if (current == null) return const SizedBox.shrink();
    final step = sandRankStepByTrackIndex(current.trackIndex);
    if (step == null) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final color = sandRankColor(step.rankCode);

    if (compact) {
      return Tooltip(
        message: 'Elo ${sandRankLabel(step)}',
        child: SandRankEmblem(
          rankCode: step.rankCode,
          division: step.division,
          size: SandRankEmblemSize.small,
        ),
      );
    }

    final title = SandRankRewardCatalog.displayTitleFor(equippedTitleId);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SandRankEmblem(
            rankCode: step.rankCode,
            division: step.division,
            size: SandRankEmblemSize.small,
          ),
          const SizedBox(width: 6),
          Text(
            'ELO · ${sandRankLabel(step)}',
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4,
              color: color,
            ),
          ),
          if (title != null) ...[
            const SizedBox(width: 6),
            Text(
              '“$title”',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                fontStyle: FontStyle.italic,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
