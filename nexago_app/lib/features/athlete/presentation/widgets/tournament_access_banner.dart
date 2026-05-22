import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/profile_access.dart';

/// Banner quando torneios oficiais estão bloqueados por perfil/onboarding.
class TournamentAccessBanner extends StatelessWidget {
  const TournamentAccessBanner({
    super.key,
    required this.onboardingCompleted,
    required this.profileStepsComplete,
  });

  final bool onboardingCompleted;
  final bool profileStepsComplete;

  @override
  Widget build(BuildContext context) {
    final message = tournamentAccessBlockMessage(
      onboardingCompleted: onboardingCompleted,
      profileStepsComplete: profileStepsComplete,
    );
    if (message == null) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final ctaLabel = !onboardingCompleted
        ? 'Continuar cadastro'
        : 'Completar perfil';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised,
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
              color: AppColors.onSurface,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
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
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}
