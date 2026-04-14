import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Aba Início do atleta (placeholder).
class AthleteHomePage extends StatelessWidget {
  const AthleteHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.home_outlined,
                size: 56,
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.5),
              ),
              const SizedBox(height: 16),
              Text(
                'Início',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Conteúdo em breve.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
