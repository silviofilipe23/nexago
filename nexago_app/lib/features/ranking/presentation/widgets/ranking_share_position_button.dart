import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

/// "Compartilhar minha posição": abre o story do ranking. Fica no topo da
/// lista (e não na linha "Sua posição") porque quem está no pódio não tem
/// essa linha.
class RankingSharePositionButton extends StatelessWidget {
  const RankingSharePositionButton({
    super.key,
    required this.rank,
    required this.onTap,
  });

  final int rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: AppColors.brand.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('ranking-share-position'),
        onTap: onTap,
        child: SizedBox(
          height: 44,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Icon(Icons.ios_share_rounded,
                    size: 18, color: colors.brandText),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Compartilhar minha posição',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '$rankº',
                  style: AppTypography.mono(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: colors.brandText,
                  ),
                ),
                const SizedBox(width: 2),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: colors.onSurfaceMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
