import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../domain/athlete_onboarding_draft.dart';
import '../../domain/athlete_onboarding_options.dart';
import '../../domain/athlete_onboarding_providers.dart';
import '../widgets/onboarding_level_tile.dart';
import '../widgets/onboarding_progress_header.dart';
import '../widgets/onboarding_scaffold.dart';
import '../widgets/onboarding_step_header.dart';

class AthleteOnboardingLevelStep extends ConsumerWidget {
  const AthleteOnboardingLevelStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(athleteOnboardingDraftProvider);
    final notifier = ref.read(athleteOnboardingDraftProvider.notifier);
    final step = AthleteOnboardingStep.level;
    final sportLabel = draft.primarySportLabel ?? 'esporte';

    return OnboardingScaffold(
      topBar: OnboardingProgressHeader(
        currentStep: step.stepIndex,
        totalSteps: AthleteOnboardingOptions.totalSteps,
        onBack: () => context.go(AppRoutes.athleteOnboardingPrimarySport),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OnboardingStepHeader(
            stepIndex: 2,
            totalSteps: AthleteOnboardingOptions.totalSteps,
            title: 'Seu nível no $sportLabel?',
            titleHighlight: sportLabel,
            subtitle: 'Garante partidas e torneios no seu nível.',
          ),
          const SizedBox(height: 20),
          // Escada do esporte principal escolhido (vôlei: 5 níveis; demais: 3).
          ...AthleteOnboardingOptions.levelsForSport(draft.primarySportId)
              .map((option) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: OnboardingLevelTile(
                option: option,
                selected: draft.level == option.label,
                onTap: () => notifier.setLevel(option.label),
              ),
            );
          }),
        ],
      ),
      primaryLabel: 'Continuar',
      primaryEnabled: draft.canContinueFrom(step),
      onPrimary: () => context.go(AppRoutes.athleteOnboardingProfile),
    );
  }
}
