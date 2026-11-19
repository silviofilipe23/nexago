import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

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
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool enabled;

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
