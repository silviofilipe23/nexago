import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_logic.dart';

/// "Você × adversário" em cada set já jogado — duas barras por set.
///
/// A altura é relativa ao MAIOR ponto de qualquer barra, não a um teto fixo:
/// um set de vôlei termina em 25 e um tie-break em 15, e uma escala fixa
/// achataria um dos dois.
class FocusSetBars extends StatelessWidget {
  const FocusSetBars({super.key, required this.bars});

  final List<SetBar> bars;

  static const double _height = 96;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final max = bars.fold<int>(
      1,
      (acc, b) => math.max(acc, math.max(b.mine, b.theirs)),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.md,
        AppSpacing.screenH,
        0,
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final bar in bars)
              Padding(
                padding: const EdgeInsets.only(right: AppSpacing.md),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      height: _height,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _Bar(
                            value: bar.mine,
                            max: max,
                            color: colors.brand,
                          ),
                          const SizedBox(width: 3),
                          _Bar(
                            value: bar.theirs,
                            max: max,
                            color: colors.outline,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      bar.label,
                      style: AppTypography.bodyS.copyWith(
                        color: colors.onSurfaceMuted,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.value, required this.max, required this.color});

  final int value;
  final int max;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      // Piso de 2px: um set fechado em 0 ainda precisa aparecer como barra,
      // senão a coluna some e o leitor acha que o set não existiu.
      height: math.max(2, FocusSetBars._height * (value / max)),
      decoration: BoxDecoration(
        color: color,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
      ),
    );
  }
}
