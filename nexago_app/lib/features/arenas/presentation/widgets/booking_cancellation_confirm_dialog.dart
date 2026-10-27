import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/formatting/app_date_format.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../domain/arena_booking_cancellation_policy.dart';
import '../../domain/arena_booking_labels.dart';

/// Confirmação antes de o atleta cancelar uma reserva de quadra — a mesma em
/// Minhas reservas e em Detalhes da reserva. Devolve `true` só quando ele
/// confirmou e ainda está no prazo grátis: se o prazo acabou com o diálogo
/// aberto, avisa e devolve `false`.
Future<bool> confirmBookingCancellation(
  BuildContext context, {
  required String arenaName,
  required String courtName,
  required DateTime startAt,
  DateTime Function() clock = DateTime.now,
}) async {
  final court = courtName.trim().isEmpty ? 'Quadra' : courtName.trim();
  final when = '${formatBookingDateHeader(calendarDateKey(startAt))} · '
      '${startAt.hour.toString().padLeft(2, '0')}:'
      '${startAt.minute.toString().padLeft(2, '0')}';

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: ctx.themeColors.surfaceSheet,
      title: const Text('Cancelar reserva?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$court · $when',
            style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: ctx.themeColors.onSurface,
                ),
          ),
          const SizedBox(height: 10),
          Text(
            ArenaBookingCancellationPolicy.confirmCancellationMessage(
                arenaName),
          ),
        ],
      ),
      actions: [
        TextButton(
          key: const Key('booking-cancel-keep'),
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Manter reserva'),
        ),
        FilledButton(
          key: const Key('booking-cancel-confirm'),
          onPressed: () => Navigator.pop(ctx, true),
          style: FilledButton.styleFrom(backgroundColor: AppColors.live),
          child: const Text('Cancelar reserva'),
        ),
      ],
    ),
  );
  if (confirmed != true) return false;

  if (!ArenaBookingCancellationPolicy.canCancelBookingForFree(
    startAt,
    clock(),
  )) {
    if (context.mounted) {
      showAppSnackBar(
        context,
        ArenaBookingCancellationPolicy.blockedCancellationMessage(
          arenaName: arenaName,
        ),
      );
    }
    return false;
  }
  return true;
}
