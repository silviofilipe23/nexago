import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_sport_codes.dart';

/// Esporte da reserva: o atleta escolhe entre os esportes da quadra para a arena saber o que vai
/// ser jogado. [options] são códigos (`bookingSportOptions`); `null` enquanto as quadras carregam.
class BookingConfirmSportPicker extends StatelessWidget {
  const BookingConfirmSportPicker({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.enabled = true,
  });

  final List<String>? options;
  final String? selected;
  final ValueChanged<String> onSelected;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final options = this.options;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ESPORTE',
          style: AppTypography.mono(
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Qual esporte você vai jogar? A arena usa isso pra preparar a quadra.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
            height: 1.35,
          ),
        ),
        const SizedBox(height: 12),
        if (options == null)
          const SizedBox(
            height: 40,
            child: Align(
              alignment: Alignment.centerLeft,
              child: SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final code in options)
                _SportChip(
                  label: courtSportLabel(code),
                  selected: code == selected,
                  enabled: enabled,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onSelected(code);
                  },
                ),
            ],
          ),
      ],
    );
  }
}

class _SportChip extends StatelessWidget {
  const _SportChip({
    required this.label,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      selected: selected,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: selected
              ? AppColors.brand.withValues(alpha: 0.14)
              : context.themeColors.surfaceRaised,
          border: Border.all(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.9)
                : theme.colorScheme.outline.withValues(alpha: 0.2),
            // Largura fixa: borda mais grossa no selecionado empurrava a linha de chips.
            width: 1.2,
          ),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: enabled ? onTap : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (selected) ...[
                  const Icon(
                    Icons.check_rounded,
                    size: 16,
                    color: AppColors.brand,
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    color: selected ? AppColors.brand : null,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
