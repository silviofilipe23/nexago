import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/booking_athlete_notes.dart';
import 'booking_confirm_option_row.dart';

/// Recado opcional para a arena no checkout. Começa recolhido (linha "Recado para
/// a arena", como o cupom) para não pesar a tela; aberto, mostra o campo com contador. O
/// texto vai na reserva e aparece para a arena no detalhe.
class BookingConfirmAthleteNotesField extends StatefulWidget {
  const BookingConfirmAthleteNotesField({
    super.key,
    required this.controller,
    this.enabled = true,
  });

  final TextEditingController controller;
  final bool enabled;

  @override
  State<BookingConfirmAthleteNotesField> createState() =>
      _BookingConfirmAthleteNotesFieldState();
}

class _BookingConfirmAthleteNotesFieldState
    extends State<BookingConfirmAthleteNotesField> {
  late bool _expanded = widget.controller.text.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    if (!_expanded) {
      return BookingConfirmOptionRow(
        key: const Key('booking-confirm-athlete-notes-open'),
        icon: Icons.chat_bubble_outline_rounded,
        label: 'Recado para a arena',
        enabled: widget.enabled,
        onTap: () => setState(() => _expanded = true),
      );
    }

    final theme = Theme.of(context);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide(
        color: context.themeColors.outline.withValues(alpha: 0.25),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'RECADO PARA A ARENA (OPCIONAL)',
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          key: const Key('booking-confirm-athlete-notes-field'),
          controller: widget.controller,
          enabled: widget.enabled,
          autofocus: true,
          maxLines: 4,
          minLines: 2,
          maxLength: kAthleteNotesMaxLength,
          textCapitalization: TextCapitalization.sentences,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurface,
          ),
          decoration: InputDecoration(
            hintText: 'Ex: vamos chegar 10 min antes, precisamos de bola...',
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.7),
            ),
            helperText: 'A arena vê esse recado junto com a reserva.',
            helperMaxLines: 2,
            filled: true,
            fillColor: context.themeColors.surfaceRaised,
            border: border,
            enabledBorder: border,
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(
                color: AppColors.brand.withValues(alpha: 0.6),
              ),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 14,
            ),
          ),
        ),
      ],
    );
  }
}
