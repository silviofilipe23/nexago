import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../domain/tournament_create/tournament_create_draft.dart';
import '../../domain/tournament_create/tournament_create_providers.dart';

enum WizardCloseAction { keepEditing, exit, discard }

TournamentCreateStep? nextCreateStep(TournamentCreateStep step) {
  final index = step.index + 1;
  if (index >= TournamentCreateStep.values.length) return null;
  return TournamentCreateStep.values[index];
}

TournamentCreateStep? previousCreateStep(TournamentCreateStep step) {
  final index = step.index - 1;
  if (index < 0) return null;
  return TournamentCreateStep.values[index];
}

String routeNameForCreateStep(TournamentCreateStep step) => switch (step) {
      TournamentCreateStep.identity =>
        AppRouteNames.organizerTournamentCreateIdentity,
      TournamentCreateStep.location =>
        AppRouteNames.organizerTournamentCreateLocation,
      TournamentCreateStep.categories =>
        AppRouteNames.organizerTournamentCreateCategories,
      TournamentCreateStep.registration =>
        AppRouteNames.organizerTournamentCreateRegistration,
      TournamentCreateStep.prizes =>
        AppRouteNames.organizerTournamentCreatePrizes,
      TournamentCreateStep.rules =>
        AppRouteNames.organizerTournamentCreateRules,
      TournamentCreateStep.review =>
        AppRouteNames.organizerTournamentCreateReview,
    };

TournamentCreateStep stepFromRouteName(String name) => switch (name) {
      AppRouteNames.organizerTournamentCreateIdentity =>
        TournamentCreateStep.identity,
      AppRouteNames.organizerTournamentCreateLocation =>
        TournamentCreateStep.location,
      AppRouteNames.organizerTournamentCreateCategories =>
        TournamentCreateStep.categories,
      AppRouteNames.organizerTournamentCreateRegistration =>
        TournamentCreateStep.registration,
      AppRouteNames.organizerTournamentCreatePrizes =>
        TournamentCreateStep.prizes,
      AppRouteNames.organizerTournamentCreateRules =>
        TournamentCreateStep.rules,
      AppRouteNames.organizerTournamentCreateReview =>
        TournamentCreateStep.review,
      _ => TournamentCreateStep.identity,
    };

void syncWizardStep(WidgetRef ref, TournamentCreateStep step) {
  ref.read(tournamentCreateWizardProvider.notifier).setCurrentStep(step);
}

void goToCreateStep(BuildContext context, WidgetRef ref, TournamentCreateStep step) {
  ref.read(tournamentCreateWizardProvider.notifier).setCurrentStep(step);
  context.goNamed(routeNameForCreateStep(step));
}

void goToNextCreateStep(
  BuildContext context,
  WidgetRef ref,
  TournamentCreateStep current,
) {
  final next = nextCreateStep(current);
  if (next == null) return;
  ref.read(tournamentCreateWizardProvider.notifier).setCurrentStep(next);
  context.pushNamed(routeNameForCreateStep(next));
}

Future<WizardCloseAction?> confirmExitWizard(BuildContext context) {
  return showDialog<WizardCloseAction>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Sair do cadastro?'),
      content: const Text(
        'Você pode continuar depois de onde parou. Para apagar tudo, escolha descartar.',
      ),
      actions: [
        TextButton(
          onPressed: () =>
              Navigator.of(context).pop(WizardCloseAction.keepEditing),
          child: const Text('Continuar editando'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(WizardCloseAction.exit),
          child: const Text('Sair'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(WizardCloseAction.discard),
          child: const Text('Descartar'),
        ),
      ],
    ),
  );
}

Future<void> handleWizardClose(BuildContext context, WidgetRef ref) async {
  final action = await confirmExitWizard(context);
  if (!context.mounted) return;

  switch (action) {
    case WizardCloseAction.exit:
      context.goNamed(AppRouteNames.organizerHome);
    case WizardCloseAction.discard:
      await ref.read(tournamentCreateWizardProvider.notifier).clearSession();
      if (context.mounted) {
        context.goNamed(AppRouteNames.organizerHome);
      }
    case WizardCloseAction.keepEditing:
    case null:
      break;
  }
}

Future<bool?> confirmStartFreshWizard(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Cadastro em andamento'),
      content: const Text(
        'Você tem um torneio sendo criado. Deseja continuar de onde parou ou começar do zero?',
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
