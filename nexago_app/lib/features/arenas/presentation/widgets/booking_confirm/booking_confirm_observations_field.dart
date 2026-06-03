import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class BookingConfirmObservationsField extends StatelessWidget {
  const BookingConfirmObservationsField({
    super.key,
    required this.controller,
    this.enabled = true,
  });

  final TextEditingController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'OBSERVAÇÕES (OPCIONAL)',
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 10),
        TextField(
          controller: controller,
          enabled: enabled,
          maxLines: 3,
          minLines: 2,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurface,
          ),
          decoration: InputDecoration(
            hintText:
                'Ex: vamos chegar 5 min adiantados, precisamos de rede nova...',
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.7),
            ),
            filled: true,
            fillColor: context.themeColors.surfaceRaised,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(
                color: Colors.white.withValues(alpha: 0.06),
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(
                color: Colors.white.withValues(alpha: 0.06),
              ),
            ),
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
