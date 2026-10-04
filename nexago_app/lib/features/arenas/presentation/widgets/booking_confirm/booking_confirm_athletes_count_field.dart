import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';

/// Quantidade estimada de atletas na reserva (stepper).
class BookingConfirmAthletesCountField extends StatelessWidget {
  const BookingConfirmAthletesCountField({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  static const int minAthletes = 1;
  static const int maxAthletes = 30;

  final int value;
  final ValueChanged<int> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    void change(int next) {
      HapticFeedback.selectionClick();
      onChanged(next.clamp(minAthletes, maxAthletes));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'QUANTIDADE DE ATLETAS',
          style: AppTypography.mono(
            color: colors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
          ),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Diminuir',
                onPressed: enabled && value > minAthletes
                    ? () => change(value - 1)
                    : null,
                icon: const Icon(Icons.remove_circle_outline_rounded),
                color: AppColors.brand,
              ),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '$value',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(
                      value == 1 ? 'atleta (estimado)' : 'atletas (estimado)',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Aumentar',
                onPressed: enabled && value < maxAthletes
                    ? () => change(value + 1)
                    : null,
                icon: const Icon(Icons.add_circle_outline_rounded),
                color: AppColors.brand,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
