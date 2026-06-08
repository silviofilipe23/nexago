import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Banner quando torneios oficiais estão bloqueados por perfil/onboarding.
class TournamentAccessBanner extends StatelessWidget {
  const TournamentAccessBanner({
    super.key,
    required this.onboardingCompleted,
    required this.blockMessage,
    this.missingStepTitles = const [],
  });

  final bool onboardingCompleted;
  final String? blockMessage;
  final List<String> missingStepTitles;

  @override
  Widget build(BuildContext context) {
    final message = blockMessage;
    if (message == null) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final ctaLabel = !onboardingCompleted
        ? 'Continuar cadastro'
        : 'Completar perfil';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.45),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            message,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurface,
              height: 1.35,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (missingStepTitles.isNotEmpty) ...[
            SizedBox(height: 12),
            Text(
              'PASSOS PENDENTES',
              style: theme.textTheme.labelSmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                fontSize: 10,
              ),
            ),
            SizedBox(height: 8),
            ...missingStepTitles.map(
              (title) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Icon(
                        Icons.circle,
                        size: 6,
                        color: AppColors.brand,
                      ),
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        title,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: context.themeColors.onSurface,
                          height: 1.3,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          SizedBox(height: 12),
          FilledButton(
            onPressed: () {
              if (!onboardingCompleted) {
                context.go(AppRoutes.athleteOnboardingWelcome);
              } else {
                context.pushNamed(AppRouteNames.athleteCompleteProfile);
              }
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              ctaLabel,
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}
