import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';

/// Sheet de confirmação de nível na PRIMEIRA inscrição do atleta em um
/// esporte (plano de calibração de nível, Task 6): última chance de revisar
/// o nível antes de travar o ratchet "nível só sobe" — `levelLocked` é
/// gravado pelo backend na 1ª inscrição ATIVA daquele esporte, e depois
/// disso o nível só pode subir.
///
/// Retorna:
/// - `true` se o atleta tocou "Confirmar e continuar" → segue com a inscrição;
/// - `false` se tocou "Ajustar nível" → o chamador navega para
///   "Esportes e níveis" e NÃO submete a inscrição;
/// - `null` se fechou o sheet sem escolher (arrastar/tocar fora) → também
///   não submete, mas sem navegar.
Future<bool?> showLevelConfirmationSheet(
  BuildContext context, {
  required String levelLabel,
  required String sportLabel,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetContext) => LevelConfirmationSheet(
      levelLabel: levelLabel,
      sportLabel: sportLabel,
    ),
  );
}

/// Conteúdo do sheet — exposto para testes de widget.
class LevelConfirmationSheet extends StatelessWidget {
  const LevelConfirmationSheet({
    super.key,
    required this.levelLabel,
    required this.sportLabel,
  });

  final String levelLabel;
  final String sportLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 16 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Confirme seu nível',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Você vai se inscrever como $levelLabel em $sportLabel. '
              'Após a inscrição, o nível só poderá subir.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              height: 50,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text(
                  'Confirmar e continuar',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(
                'Ajustar nível',
                style: TextStyle(color: colors.onSurfaceMuted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
