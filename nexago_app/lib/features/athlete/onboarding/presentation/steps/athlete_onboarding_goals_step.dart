import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../domain/athlete_onboarding_draft.dart';
import '../../domain/athlete_onboarding_options.dart';
import '../../domain/athlete_onboarding_providers.dart';
import '../widgets/onboarding_goal_tile.dart';
import '../widgets/onboarding_progress_header.dart';
import '../widgets/onboarding_scaffold.dart';
import '../widgets/onboarding_step_header.dart';

class AthleteOnboardingGoalsStep extends ConsumerWidget {
  const AthleteOnboardingGoalsStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(athleteOnboardingDraftProvider);
    final notifier = ref.read(athleteOnboardingDraftProvider.notifier);
    final step = AthleteOnboardingStep.goals;

    return OnboardingScaffold(
      topBar: OnboardingProgressHeader(
        currentStep: step.stepIndex,
        totalSteps: AthleteOnboardingOptions.totalSteps,
        onBack: () => context.go(AppRoutes.athleteOnboardingLevel),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OnboardingStepHeader(
            stepIndex: 4,
            totalSteps: AthleteOnboardingOptions.totalSteps,
            title: 'O que você busca?',
            subtitle: 'Isso personaliza recomendações e notificações.',
          ),
          const SizedBox(height: 20),
          ...AthleteOnboardingOptions.goals.map((option) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: OnboardingGoalTile(
                option: option,
                selected: draft.goalIds.contains(option.id),
                onTap: () => notifier.toggleGoal(option.id),
              ),
            );
          }),
        ],
      ),
      primaryLabel: 'Continuar',
      onPrimary: () => context.go(AppRoutes.athleteOnboardingProfile),
      secondaryLabel: 'Pular esta etapa',
      onSecondary: () => context.go(AppRoutes.athleteOnboardingProfile),
    );
  }
}
