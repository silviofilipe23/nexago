import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../domain/league_create/league_create_draft.dart';
import '../../domain/league_create/league_create_providers.dart';
import '../tournament_create/tournament_create_navigation.dart';

LeagueCreateStep? nextLeagueCreateStep(LeagueCreateStep step) {
  final index = step.index + 1;
  if (index >= LeagueCreateStep.values.length) return null;
  return LeagueCreateStep.values[index];
}

LeagueCreateStep? previousLeagueCreateStep(LeagueCreateStep step) {
  final index = step.index - 1;
  if (index < 0) return null;
  return LeagueCreateStep.values[index];
}

String routeNameForLeagueCreateStep(LeagueCreateStep step) => switch (step) {
      LeagueCreateStep.identity => AppRouteNames.organizerLeagueCreateIdentity,
      LeagueCreateStep.season => AppRouteNames.organizerLeagueCreateSeason,
      LeagueCreateStep.categories =>
        AppRouteNames.organizerLeagueCreateCategories,
      LeagueCreateStep.ranking => AppRouteNames.organizerLeagueCreateRanking,
      LeagueCreateStep.stages => AppRouteNames.organizerLeagueCreateStages,
      LeagueCreateStep.review => AppRouteNames.organizerLeagueCreateReview,
    };

LeagueCreateStep leagueStepFromRouteName(String name) => switch (name) {
      AppRouteNames.organizerLeagueCreateIdentity => LeagueCreateStep.identity,
      AppRouteNames.organizerLeagueCreateSeason => LeagueCreateStep.season,
      AppRouteNames.organizerLeagueCreateCategories =>
        LeagueCreateStep.categories,
      AppRouteNames.organizerLeagueCreateRanking => LeagueCreateStep.ranking,
      AppRouteNames.organizerLeagueCreateStages => LeagueCreateStep.stages,
      AppRouteNames.organizerLeagueCreateReview => LeagueCreateStep.review,
      _ => LeagueCreateStep.identity,
    };

void syncLeagueWizardStep(WidgetRef ref, LeagueCreateStep step) {
  ref.read(leagueCreateWizardProvider.notifier).setCurrentStep(step);
}

void goToLeagueCreateStep(
  BuildContext context,
  WidgetRef ref,
  LeagueCreateStep step,
) {
  ref.read(leagueCreateWizardProvider.notifier).setCurrentStep(step);
  context.goNamed(routeNameForLeagueCreateStep(step));
}

void goToNextLeagueCreateStep(
  BuildContext context,
  WidgetRef ref,
  LeagueCreateStep current,
) {
  final next = nextLeagueCreateStep(current);
  if (next == null) return;
  ref.read(leagueCreateWizardProvider.notifier).setCurrentStep(next);
  context.pushNamed(routeNameForLeagueCreateStep(next));
}

Future<void> handleLeagueWizardClose(BuildContext context, WidgetRef ref) async {
  final action = await confirmExitWizard(context);
  if (!context.mounted) return;

  switch (action) {
    case WizardCloseAction.exit:
      context.goNamed(AppRouteNames.organizerHome);
    case WizardCloseAction.discard:
      await ref.read(leagueCreateWizardProvider.notifier).discardSession();
      if (context.mounted) {
        context.goNamed(AppRouteNames.organizerHome);
      }
    case WizardCloseAction.keepEditing:
    case null:
      break;
  }
}

Future<bool?> confirmStartFreshLeagueWizard(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Cadastro em andamento'),
      content: const Text(
        'Você tem uma liga sendo criada. Deseja continuar de onde parou ou começar do zero?',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Continuar cadastro'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Começar do zero'),
        ),
      ],
    ),
  );
}

Future<bool?> confirmWizardTypeConflict(
  BuildContext context, {
  required bool hasTournamentDraft,
  required bool hasLeagueDraft,
}) {
  final message = hasTournamentDraft && hasLeagueDraft
      ? 'Você tem um torneio e uma liga em andamento. Qual deseja continuar?'
      : hasTournamentDraft
          ? 'Você tem um torneio em andamento. Deseja continuar o torneio ou iniciar a liga?'
          : 'Você tem uma liga em andamento. Deseja continuar a liga ou iniciar o torneio?';

  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Cadastro em andamento'),
      content: Text(message),
      actions: [
        if (hasTournamentDraft)
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Continuar torneio'),
          ),
        if (hasLeagueDraft)
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Continuar liga'),
          ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(null),
          child: const Text('Cancelar'),
        ),
      ],
    ),
  );
}
