import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Caixa de aviso âmbar do wizard: a regra que o atleta precisa ler antes de
/// seguir (dupla obrigatória, prazo do uniforme, relógio da vaga).
class RegistrationWizardNotice extends StatelessWidget {
  const RegistrationWizardNotice({
    super.key,
    required this.child,
    this.icon = Icons.lock_outline_rounded,
  });

  final Widget child;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.pending.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.pending),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: DefaultTextStyle.merge(
              style: Theme.of(context).textTheme.bodyMedium!.copyWith(
                color: context.themeColors.onSurface,
                height: 1.45,
              ),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}
