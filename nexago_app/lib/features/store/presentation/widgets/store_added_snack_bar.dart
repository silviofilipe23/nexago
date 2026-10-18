import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

/// Aviso de "foi pro carrinho" da Loja ("Adicionado ao carrinho · Ver"), com
/// a ação que abre o carrinho. Vitrine, produto e favoritos usam o mesmo.
void showStoreAddedSnackBar(
  BuildContext context, {
  required String message,
  required String actionLabel,
  required VoidCallback onAction,
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..clearSnackBars()
    ..showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        action: SnackBarAction(
          label: actionLabel,
          textColor: AppColors.brand,
          onPressed: onAction,
        ),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
        backgroundColor: AppColors.black.withValues(alpha: 0.88),
        duration: const Duration(seconds: 4),
        // Com ação o SnackBar fica até ser fechado (`persist` padrão) e
        // ignora o `duration` — seguia até por cima da tela seguinte.
        persist: false,
      ),
    );
}
