import 'package:flutter/material.dart';

import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Uma linha discreta no lugar de um bloco do Focus que ainda não tem o que
/// mostrar — a chave não sorteada, nenhuma partida encerrada.
class FocusEmptyLine extends StatelessWidget {
  const FocusEmptyLine({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenH,
        vertical: AppSpacing.md,
      ),
      child: Text(
        text,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}
