import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';

/// Banco de horas do mensalista na confirmação: saldo da semana ou o aviso de
/// por que o banco não entrou (mensalidade em aberto, semana esgotada).
class BookingConfirmMemberHoursNote extends StatelessWidget {
  const BookingConfirmMemberHoursNote({
    super.key,
    required this.title,
    required this.message,
    this.warning = false,
  });

  /// Nome do plano ("Mensalista 3h") ou "Banco de horas".
  final String title;
  final String message;

  /// Atraso/semana esgotada: tom de alerta.
  final bool warning;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final tone =
        colors.readableTone(warning ? AppColors.pending : AppColors.win);
    return Container(
      key: const Key('booking-confirm-member-hours-note'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: tone.withValues(alpha: 0.08),
        border: Border.all(color: tone.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            warning ? Icons.info_outline_rounded : Icons.schedule_rounded,
            size: 20,
            color: tone,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  message,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
