import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Snackbar flutuante, cantos arredondados — erros e feedback geral.
void showAppSnackBar(
  BuildContext context,
  String message, {
  bool isError = false,
  Duration duration = const Duration(seconds: 4),
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;

  messenger.clearSnackBars();
  messenger.showSnackBar(
    SnackBar(
      content: Text(
        message,
        style: TextStyle(
          color: isError ? Colors.white : null,
          fontWeight: FontWeight.w500,
        ),
      ),
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      backgroundColor: isError ? const Color(0xFFB71C1C) : AppColors.black.withValues(alpha: 0.88),
      duration: duration,
    ),
  );
}

void showAppErrorSnackBar(BuildContext context, Object error) {
  final text = error.toString().replaceFirst('Exception: ', '');
  showAppSnackBar(
    context,
    text.length > 200 ? '${text.substring(0, 200)}…' : text,
    isError: true,
  );
}
