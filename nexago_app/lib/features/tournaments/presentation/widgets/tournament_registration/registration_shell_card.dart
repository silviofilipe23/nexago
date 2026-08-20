import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/nexa_card.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Cartão numerado da tela de inscrição — o `rg-card` + `rg-step-title` do
/// portal do atleta.
///
/// Os passos viraram cartões empilhados numa tela só (paridade de layout com a
/// web); o número serve de âncora visual do progresso, já que não há mais
/// navegação entre telas para marcá-lo.
class RegistrationShellCard extends StatelessWidget {
  const RegistrationShellCard({
    super.key,
    required this.step,
    required this.title,
    required this.child,
    this.trailing,
  });

  final int step;
  final String title;
  final Widget child;

  /// Canto direito do título (ex.: selo "Salvo" do uniforme).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _StepNumber(step: step),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  title,
                  style: AppTypography.soraRegular(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          child,
        ],
      ),
    );
  }
}

class _StepNumber extends StatelessWidget {
  const _StepNumber({required this.step});

  final int step;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.18),
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
      ),
      child: Text(
        '$step',
        style: AppTypography.mono(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: AppColors.brand,
        ),
      ),
    );
  }
}

/// Pill de metadado da categoria (`rg-pill`).
class RegistrationShellPill extends StatelessWidget {
  const RegistrationShellPill({
    super.key,
    required this.label,
    this.tone = RegistrationPillTone.neutral,
  });

  final String label;
  final RegistrationPillTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (bg, fg, border) = switch (tone) {
      RegistrationPillTone.brand => (
        AppColors.brand.withValues(alpha: 0.16),
        AppColors.brand,
        AppColors.brand.withValues(alpha: 0.35),
      ),
      RegistrationPillTone.warn => (
        AppColors.pending.withValues(alpha: 0.16),
        AppColors.pending,
        AppColors.pending.withValues(alpha: 0.35),
      ),
      RegistrationPillTone.neutral => (
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

enum RegistrationPillTone { neutral, brand, warn }

/// Linha de texto explicativo dentro de um cartão (`rg-empty-inline`).
class RegistrationShellNote extends StatelessWidget {
  const RegistrationShellNote(this.text, {super.key, this.tone});

  final String text;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
        color: tone ?? context.themeColors.onSurfaceMuted,
        height: 1.45,
        fontWeight: FontWeight.w500,
      ),
    );
  }
}
