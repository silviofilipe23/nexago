import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/predictions/tournament_predictions_logic.dart';

/// Seta de variação de posição no ranking de palpites.
///
/// Sem `previousRank` gravado pelo servidor, [delta] vem `null` e o widget
/// desenha um traço: a coluna existe em todas as linhas, então a lista não
/// "pula" quando parte dos participantes tem foto de posição e parte não.
class PredictionRankDelta extends StatelessWidget {
  const PredictionRankDelta({super.key, required this.delta});

  final int? delta;

  @override
  Widget build(BuildContext context) {
    final value = delta;
    final label = predictionDeltaLabel(value);

    if (value == null || value == 0 || label == null) {
      return SizedBox(
        width: 34,
        child: Text(
          '—',
          textAlign: TextAlign.right,
          style: AppTypography.mono(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      );
    }

    final up = value > 0;
    return SizedBox(
      width: 34,
      child: Semantics(
        label: label,
        child: Text(
          '${up ? '↑' : '↓'}${value.abs()}',
          textAlign: TextAlign.right,
          style: AppTypography.mono(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: up ? const Color(0xFF2BD17E) : const Color(0xFFFF6B6B),
          ),
        ),
      ),
    );
  }
}
