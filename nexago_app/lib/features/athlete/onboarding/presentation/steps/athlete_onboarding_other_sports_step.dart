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

class AthleteOnboardingOtherSportsStep extends ConsumerWidget {
  const AthleteOnboardingOtherSportsStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(athleteOnboardingDraftProvider);
    final notifier = ref.read(athleteOnboardingDraftProvider.notifier);
    final step = AthleteOnboardingStep.otherSports;

    return OnboardingScaffold(
      topBar: OnboardingProgressHeader(
        currentStep: step.stepIndex,
        totalSteps: AthleteOnboardingOptions.totalSteps,
        onBack: () => context.go(AppRoutes.athleteOnboardingPrimarySport),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OnboardingStepHeader(
            stepIndex: 2,
            totalSteps: AthleteOnboardingOptions.totalSteps,
            title: 'Outros esportes',
            subtitle: 'Pratica mais algum? Marca quantos quiser.',
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
              final isPrimary = draft.primarySportId == option.id;
              return OnboardingSportTile(
                option: option,
                selected:
                    isPrimary || draft.otherSportIds.contains(option.id),
                multiSelect: true,
                onTap: isPrimary ? () {} : () => notifier.toggleOtherSport(option.id),
              );
            },
          ),
        ],
      ),
      primaryLabel: 'Continuar',
      onPrimary: () => context.go(AppRoutes.athleteOnboardingLevel),
      secondaryLabel: 'Pular esta etapa',
      onSecondary: () => context.go(AppRoutes.athleteOnboardingLevel),
    );
  }
}
