import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Pill de metadado curto (ex.: "COMPLETO"/"PENDENTE" no uniforme do
/// parceiro, passo 5 do wizard).
///
/// Portada de `RegistrationShellPill` (tela única, aposentada) — o widget em
/// si não tinha nada a ver com a tela única, só morava no mesmo arquivo dela.
class RegistrationWizardPill extends StatelessWidget {
  const RegistrationWizardPill({
    super.key,
    required this.label,
    this.tone = RegistrationWizardPillTone.neutral,
  });

  final String label;
  final RegistrationWizardPillTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (bg, fg, border) = switch (tone) {
      RegistrationWizardPillTone.brand => (
        AppColors.brand.withValues(alpha: 0.16),
        AppColors.brand,
        AppColors.brand.withValues(alpha: 0.35),
      ),
      RegistrationWizardPillTone.warn => (
        AppColors.pending.withValues(alpha: 0.16),
        AppColors.pending,
        AppColors.pending.withValues(alpha: 0.35),
      ),
      RegistrationWizardPillTone.neutral => (
        colors.onSurface.withValues(alpha: 0.06),
        colors.onSurfaceMuted,
        colors.onSurface.withValues(alpha: 0.10),
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: border),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: fg,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

enum RegistrationWizardPillTone { neutral, brand, warn }
