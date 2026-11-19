import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_colors.dart';

/// Linha opcional recolhida do checkout ("Tenho um cupom", "Recado para a
/// arena"): ocupa uma linha até o atleta tocar, e aí a tela mostra o campo.
/// Quem não precisa do extra não rola por ele.
class BookingConfirmOptionRow extends StatelessWidget {
  const BookingConfirmOptionRow({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.enabled = true,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool enabled;

  /// Texto curto antes da seta ("2 disponíveis").
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceRaised,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: enabled ? onTap : null,
        child: Container(
          constraints: const BoxConstraints(minHeight: 52),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.outline.withValues(alpha: 0.25)),
          ),
          child: Row(
            children: [
              Icon(icon, size: 20, color: colors.onSurfaceMuted),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 8),
                Text(
                  trailing!,
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colors.readableTone(AppColors.win),
                  ),
                ),
              ],
              Icon(
                Icons.chevron_right_rounded,
                color: colors.onSurfaceMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
