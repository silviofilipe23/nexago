import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/ranking_list_models.dart';

class RankingClassificationHeader extends StatelessWidget {
  const RankingClassificationHeader({
    super.key,
    required this.mode,
    required this.count,
    this.yearLabel,
  });

  final RankingListMode mode;
  final int count;

  /// Temporada aberta ('GERAL', '2026'…). Vem do filtro, que agora mora todo
  /// dentro da folha — este é o único lugar da tela que diz qual é o recorte.
  final String? yearLabel;

  @override
  Widget build(BuildContext context) {
    final unit = mode == RankingListMode.teams ? 'DUPLAS' : 'ATLETAS';
    final meta =
        yearLabel == null ? '$count $unit' : '$yearLabel · $count $unit';

    return Row(
      children: [
        // O título cede espaço primeiro: com fonte ampliada o contador é a
        // informação que não pode virar reticências.
        Expanded(
          child: Text(
            'Classificação',
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
              letterSpacing: -0.3,
            ),
          ),
        ),
        SizedBox(width: 12),
        Text(
          meta,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}
