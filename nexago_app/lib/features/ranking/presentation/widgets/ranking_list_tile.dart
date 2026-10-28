import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_motion.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/ranking_display_helpers.dart';
import '../../domain/ranking_list_models.dart';
import 'ranking_podium.dart';

/// Linha da classificação — mesma anatomia de atletas/equipes: sem card,
/// avatar 36, nome Sora 14 e subtítulo mono 9.
class RankingListTile extends StatefulWidget {
  const RankingListTile({
    super.key,
    required this.entry,
    this.highlight = false,
    this.onTap,
    this.trailing,
    this.surfaceColor,
  });

  /// Altura aproximada para placeholder de scroll (card flutuante).
  static const approximateHeight = 60.0;

  final RankingListEntry entry;
  final bool highlight;
  final VoidCallback? onTap;

  /// Conteúdo opcional depois da pontuação. Usado pelo ranking de palpites para
  /// a variação de posição; `null` no ranking global, que não tem esse dado.
  final Widget? trailing;

  /// Fundo opaco por baixo da tinta do realce. Só o card flutuante passa: por
  /// cima das outras linhas, a tinta translúcida deixaria vazar o que está
  /// atrás. `null` mantém o realce translúcido da linha dentro da lista.
  final Color? surfaceColor;

  @override
  State<RankingListTile> createState() => _RankingListTileState();
}

class _RankingListTileState extends State<RankingListTile> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    final highlight = widget.highlight;

    final subtitle = entry.subtitle.trim();
    final title = highlight ? entry.userPositionLabel : entry.displayName;
    final avatarGap = entry.isTeam ? 14.0 : 10.0;

    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '${entry.rank}',
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: highlight || entry.rank <= 3
                    ? AppColors.brand
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          RankingAvatarGroup(entry: entry, size: RankingAvatarSizes.list),
          SizedBox(width: avatarGap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.mono(
                      fontSize: 9,
                      color: context.themeColors.onSurfaceMuted,
                      height: 1.2,
                      letterSpacing: 0,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            formatRankingPoints(entry.points),
            style: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: highlight
                  ? AppColors.brand
                  : context.themeColors.onSurface,
              height: 1,
            ),
          ),
          if (widget.trailing != null) ...[
            const SizedBox(width: 8),
            widget.trailing!,
          ],
        ],
      ),
    );

    final tint = AppColors.brand.withValues(alpha: 0.08);
    final surfaceColor = widget.surfaceColor;
    final content = highlight
        ? DecoratedBox(
            decoration: BoxDecoration(
              color: surfaceColor == null
                  ? tint
                  : Color.alphaBlend(tint, surfaceColor),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.35),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: row,
            ),
          )
        : row;

    return AnimatedScale(
      scale: _pressed ? 0.97 : 1,
      duration: AppMotion.fast,
      curve: AppMotion.curve,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: widget.onTap == null ? null : (_) => _setPressed(true),
        onTapUp: widget.onTap == null ? null : (_) => _setPressed(false),
        onTapCancel: widget.onTap == null ? null : () => _setPressed(false),
        onTap: widget.onTap,
        child: content,
      ),
    );
  }
}

class RankingUserHighlightTile extends StatelessWidget {
  const RankingUserHighlightTile({
    super.key,
    required this.entry,
    this.onTap,
    this.trailing,
    this.surfaceColor,
  });

  final RankingListEntry entry;
  final VoidCallback? onTap;
  final Widget? trailing;

  /// Ver [RankingListTile.surfaceColor].
  final Color? surfaceColor;

  @override
  Widget build(BuildContext context) {
    return RankingListTile(
      entry: entry,
      highlight: true,
      onTap: onTap,
      trailing: trailing,
      surfaceColor: surfaceColor,
    );
  }
}
