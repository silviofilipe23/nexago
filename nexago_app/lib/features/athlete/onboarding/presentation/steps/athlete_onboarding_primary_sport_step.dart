import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../domain/athlete_onboarding_draft.dart';
import '../../domain/athlete_onboarding_options.dart';
import '../../domain/athlete_onboarding_providers.dart';
import '../widgets/onboarding_progress_header.dart';
import '../widgets/onboarding_scaffold.dart';
import '../widgets/onboarding_sport_tile.dart';
import '../widgets/onboarding_step_header.dart';

class AthleteOnboardingPrimarySportStep extends ConsumerWidget {
  const AthleteOnboardingPrimarySportStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(athleteOnboardingDraftProvider);
    final notifier = ref.read(athleteOnboardingDraftProvider.notifier);
    final step = AthleteOnboardingStep.primarySport;

    return OnboardingScaffold(
      topBar: OnboardingProgressHeader(
        currentStep: step.stepIndex,
        totalSteps: AthleteOnboardingOptions.totalSteps,
        onBack: () => context.go(AppRoutes.athleteOnboardingWelcome),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OnboardingStepHeader(
            stepIndex: 1,
            totalSteps: AthleteOnboardingOptions.totalSteps,
            title: 'Seu esporte principal?',
            subtitle: 'Escolhe um — aquele que você mais pratica.',
          ),
          const SizedBox(height: 20),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.0,
            ),
            itemCount: AthleteOnboardingOptions.sports.length,
            itemBuilder: (context, index) {
              final option = AthleteOnboardingOptions.sports[index];
              return OnboardingSportTile(
                option: option,
                selected: draft.primarySportId == option.id,
                onTap: () => notifier.setPrimarySport(option.id),
              );
            },
          ),
        ],
      ),
      primaryLabel: 'Continuar',
      primaryEnabled: draft.canContinueFrom(step),
      onPrimary: () => context.go(AppRoutes.athleteOnboardingLevel),
    );
  }
}
