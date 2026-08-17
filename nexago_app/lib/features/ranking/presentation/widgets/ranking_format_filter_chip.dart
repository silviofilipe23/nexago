import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/ranking_list_models.dart';
import 'ranking_format_filter_sheet.dart';

/// Chip de formato do ranking de duplas/equipes — mesma folha de seleção do
/// filtro de gênero. Só é montado no modo de duplas: linha individual não tem
/// dupla/trio/quarteto/quinteto.
class RankingFormatFilterChip extends StatelessWidget {
  const RankingFormatFilterChip({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final RankingFormatFilter selected;
  final ValueChanged<RankingFormatFilter> onChanged;

  Future<void> _openSheet(BuildContext context) async {
    final result = await showRankingFormatFilterSheet(
      context,
      current: selected,
    );
    if (result != null && result != selected) onChanged(result);
  }

  @override
  Widget build(BuildContext context) {
    final label = rankingFormatFilterLabels[selected]!;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _openSheet(context),
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: context.themeColors.outline.withValues(alpha: 0.45),
            ),
            color: context.themeColors.surfaceRaised,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.arrow_drop_down_rounded,
                size: 18,
                color: context.themeColors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
